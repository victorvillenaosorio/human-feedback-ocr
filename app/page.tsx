'use client';
import { useState, useRef } from 'react';
import * as fabric from 'fabric';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// Configurar manualmente el worker de PDF.js con una URL desde la CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.worker.min.mjs';

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fabricCanvasRef = useRef<HTMLCanvasElement | null>(null);

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
    const pdfCanvas = canvasRef.current; // Canvas para el PDF
    const fileReader = new FileReader();
  
    fileReader.onload = async function () {
      const pdfData = new Uint8Array(this.result as ArrayBuffer);
      const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
      const page = await pdf.getPage(1); // Renderizar la primera página
  
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
  
      // Obtener las dimensiones del PDF de la respuesta de la API
      const pageInfo = result.pages[0];
      const pageWidth = pageInfo.width;
      const pageHeight = pageInfo.height;
  
      // Calcular los factores de escala basados en el tamaño del canvas y las dimensiones de la página
      const widthScaleFactor = fabricCanvas.getWidth() / pageWidth;
      const heightScaleFactor = fabricCanvas.getHeight() / pageHeight;
  
      const document = result.documents[0];
      if (document && document.fields) {
        Object.keys(document.fields).forEach((fieldName) => {
          const field = document.fields[fieldName];
          const { boundingRegions, valueString } = field;
  
          if (boundingRegions && boundingRegions.length > 0) {
            boundingRegions.forEach((region: any) => {
              const { polygon } = region;
  
              // Extraer las coordenadas del polígono
              const [x1, y1, , , x3, y3] = polygon;
  
              // Escalar las coordenadas al tamaño del canvas
              const scaledX1 = x1 * widthScaleFactor;
              const scaledY1 = y1 * heightScaleFactor;
              const scaledX3 = x3 * widthScaleFactor;
              const scaledY3 = y3 * heightScaleFactor;
  
              // Crear el recuadro en el canvas de fabric.js
              const rect = new fabric.Rect({
                left: scaledX1,
                top: scaledY1,
                width: scaledX3 - scaledX1,
                height: scaledY3 - scaledY1,
                fill: 'rgba(0, 0, 255, 0.1)',
                stroke: 'blue',
                strokeWidth: 2,
                selectable: true,
              });
  
              const text = new fabric.Text(valueString || fieldName, {
                left: scaledX1,
                top: scaledY1 - 20, // Ajustar el texto arriba del recuadro
                fontSize: 16,
                fill: 'blue',
              });
  
              fabricCanvas.add(rect);
              fabricCanvas.add(text);
            });
          }
        });
      } else {
        console.error('El resultado no tiene un formato esperado. No se puede procesar.');
      }
    };
  
    fileReader.readAsArrayBuffer(file);
  };
  
  
  
  
  return (
    <div style={{ display: 'flex', gap: '20px' }}>
      {/* Columna izquierda para mostrar los resultados en JSON */}
      <div style={{ width: '50%' }}>
        <h2>Subir Documento</h2>
        <input type="file" onChange={handleFileChange} accept="application/pdf" />
        <button onClick={handleUpload} disabled={loading}>
          {loading ? 'Procesando...' : 'Subir Documento'}
        </button>

        {result && (
          <div>
            <h3>Resultados del análisis</h3>
            <pre>{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}
      </div>

      {/* Columna derecha para visualizar el PDF con recuadros */}
      <div style={{ position: 'relative', width: '100%', height: 'auto' }}>
  {/* Canvas para el PDF */}
  <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, zIndex: 0 }}></canvas>
  
  {/* Canvas para los recuadros de fabric.js */}
  <canvas ref={fabricCanvasRef} style={{ position: 'absolute', top: 0, left: 0, zIndex: 1 }}></canvas>
</div>

    </div>
  );
}
