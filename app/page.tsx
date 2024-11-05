'use client';
import { useState, useRef } from 'react';
import * as fabric from 'fabric';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// Configurar manualmente el worker de PDF.js con una URL desde la CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.worker.min.mjs';

// Generar colores aleatorios para los recuadros
const generateRandomColor = () => {
  const letters = '0123456789ABCDEF';
  let color = '#';
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
};

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true); // Estado para controlar el panel colapsable
  const [highlightedField, setHighlightedField] = useState<string | null>(null); // Estado para la etiqueta resaltada
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fabricCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [rectangles, setRectangles] = useState<{ [key: string]: fabric.Rect }>({}); // Estado para almacenar los recuadros
  const colors = useRef<{ [key: string]: string }>({}); // Almacena colores de etiquetas y recuadros

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      alert('Por favor, selecciona un archivo');
      return;
    }

    setLoading(true);

    const formData = new FormData();
    formData.append('document', selectedFile);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Error al subir el documento');
      }

      const data = await response.json();
      setResult(data.result);
      setLoading(false);

      // Renderizar el PDF con los recuadros después de obtener los resultados
      renderPdfWithBoxes(selectedFile, data.result);
    } catch (error) {
      console.error('Error:', error);
      setLoading(false);
    }
  };

  // Función para renderizar el PDF con los recuadros superpuestos
  const renderPdfWithBoxes = async (file: File, result: any) => {
    const pdfCanvas = canvasRef.current;
    const fileReader = new FileReader();

    fileReader.onload = async function () {
      const pdfData = new Uint8Array(this.result as ArrayBuffer);
      const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
      const page = await pdf.getPage(1);

      const viewport = page.getViewport({ scale: 1 });
      pdfCanvas!.width = viewport.width;
      pdfCanvas!.height = viewport.height;

      const renderContext = {
        canvasContext: pdfCanvas!.getContext('2d')!,
        viewport: viewport,
      };

      // Renderizar el PDF en el canvas de fondo
      await page.render(renderContext).promise;

      // Crear un segundo canvas para superponer los recuadros con fabric.js
      const fabricCanvas = new fabric.Canvas(fabricCanvasRef.current!);
      fabricCanvas.setWidth(viewport.width);
      fabricCanvas.setHeight(viewport.height);
      fabricCanvas.selection = false;

      const pageInfo = result.pages[0];
      const pageWidth = pageInfo.width;
      const pageHeight = pageInfo.height;

      const widthScaleFactor = fabricCanvas.getWidth() / pageWidth;
      const heightScaleFactor = fabricCanvas.getHeight() / pageHeight;

      const document = result.documents[0];
      const rectanglesMap: { [key: string]: fabric.Rect } = {};

      if (document && document.fields) {
        Object.keys(document.fields).forEach((fieldName, index) => {
          const field = document.fields[fieldName];
          const { boundingRegions } = field;

          // Generar y almacenar un color único para cada campo
          if (!colors.current[fieldName]) {
            colors.current[fieldName] = generateRandomColor();
          }
          const color = colors.current[fieldName];

          if (boundingRegions && boundingRegions.length > 0) {
            boundingRegions.forEach((region: any) => {
              const { polygon } = region;

              const [x1, y1, , , x3, y3] = polygon;

              const scaledX1 = x1 * widthScaleFactor;
              const scaledY1 = y1 * heightScaleFactor;
              const scaledX3 = x3 * widthScaleFactor;
              const scaledY3 = y3 * heightScaleFactor;

              const correctiveFactorPX = 20;

              const rect = new fabric.Rect({
                left: scaledX1 - correctiveFactorPX,
                top: scaledY1 - correctiveFactorPX,
                width: scaledX3 - scaledX1,
                height: scaledY3 - scaledY1,
                fill: color + '33', // Transparencia del color
                stroke: color,
                strokeWidth: 2,
                selectable: true,
              });

              // Añadir evento de clic para resaltar la etiqueta correspondiente
              rect.on('mousedown', () => {
                setHighlightedField(fieldName);
              });

              fabricCanvas.add(rect);
              rectanglesMap[fieldName] = rect; // Guardar el rectángulo en el mapa
            });
          }
        });
      } else {
        console.error('El resultado no tiene un formato esperado. No se puede procesar.');
      }

      setRectangles(rectanglesMap); // Guardar los recuadros en el estado
    };

    fileReader.readAsArrayBuffer(file);
  };

  // Manejar clic en una etiqueta para resaltar el recuadro
  const handleHighlightRectangle = (fieldName: string) => {
    const rect = rectangles[fieldName];
    if (rect) {
      rect.set({ strokeWidth: 4 }); // Aumentar el grosor del borde para resaltar
      rect.set('stroke', colors.current[fieldName]); // Usar el color de la etiqueta
      rect.canvas?.renderAll();

      setTimeout(() => {
        rect.set({ strokeWidth: 2 }); // Restaurar el grosor del borde
        rect.canvas?.renderAll();
      }, 1000);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.leftPanel}>
        <h2 style={styles.title}>Subir Documento</h2>
        <input type="file" onChange={handleFileChange} accept="application/pdf" style={styles.fileInput} />
        <button onClick={handleUpload} disabled={loading} style={styles.button}>
          {loading ? 'Procesando...' : 'Subir Documento'}
        </button>

        {result && (
          <div style={styles.resultPanel}>
            <h3 style={styles.subtitle}>Resultados del análisis</h3>
            <button onClick={() => setIsCollapsed(!isCollapsed)} style={styles.collapseButton}>
              {isCollapsed ? 'Mostrar JSON' : 'Ocultar JSON'}
            </button>
            {!isCollapsed && (
              <pre style={styles.jsonViewer}>
                {JSON.stringify(result, null, 2)}
              </pre>
            )}
            <div style={styles.labelsContainer}>
              {Object.keys(result.documents[0].fields).map((fieldName, index) => (
                <div
                  key={index}
                  style={{
                    ...styles.labelItem,
                    backgroundColor: highlightedField === fieldName ? '#E3F2FD' : 'transparent',
                  }}
                  onClick={() => handleHighlightRectangle(fieldName)}
                >
                  <div
                    style={{
                      ...styles.colorSquare,
                      backgroundColor: colors.current[fieldName],
                    }}
                  ></div>
                  <span>{fieldName}: {result.documents[0].fields[fieldName].valueString}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Columna derecha para visualizar el PDF con recuadros */}
      <div style={styles.rightPanel}>
        {/* Canvas para el PDF */}
        <canvas ref={canvasRef} style={styles.canvas}></canvas>
        
        {/* Canvas para los recuadros de fabric.js */}
        <canvas ref={fabricCanvasRef} style={styles.canvasOverlay}></canvas>
      </div>
    </div>
  );
}

// Estilos de Material Design
const styles = {
  container: {
    display: 'flex',
    gap: '20px',
    padding: '20px',
    backgroundColor: '#F9F9F9',
    fontFamily: 'Arial, sans-serif',
  },
  leftPanel: {
    width: '50%',
    padding: '20px',
    backgroundColor: '#FFFFFF',
    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.1)',
    borderRadius: '8px',
  },
  title: {
    color: '#1976D2',
    fontSize: '24px',
    marginBottom: '16px',
  },
  fileInput: {
    display: 'block',
    marginBottom: '16px',
    padding: '8px',
  },
  button: {
    display: 'block',
    padding: '10px 20px',
    backgroundColor: '#1976D2',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '16px',
    marginBottom: '16px',
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.2)',
  },
  resultPanel: {
    marginTop: '20px',
  },
  subtitle: {
    color: '#424242',
    fontSize: '20px',
    marginBottom: '12px',
  },
  collapseButton: {
    padding: '6px 12px',
    backgroundColor: '#E0E0E0',
    color: '#424242',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    marginBottom: '12px',
  },
  jsonViewer: {
    maxHeight: '200px',
    overflowY: 'auto' as 'auto', // Definir 'auto' explícitamente
    padding: '12px',
    backgroundColor: '#F5F5F5',
    borderRadius: '4px',
    fontSize: '14px',
  },
  labelsContainer: {
    marginTop: '20px',
  },
  labelItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px',
    borderRadius: '4px',
    cursor: 'pointer',
    marginBottom: '8px',
    transition: 'background-color 0.3s',
  },
  colorSquare: {
    width: '16px',
    height: '16px',
    borderRadius: '2px',
    marginRight: '8px',
  },
  rightPanel: {
    width: '50%',
    position: 'relative' as 'relative',
    backgroundColor: '#FFFFFF',
    padding: '20px',
    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.1)',
    borderRadius: '8px',
  },
  canvas: {
    position: 'absolute' as 'absolute',
    top: 0,
    left: 0,
    zIndex: 0,
    borderRadius: '4px',
  },
  canvasOverlay: {
    position: 'absolute' as 'absolute',
    top: 0,
    left: 0,
    zIndex: 1,
  },
};
