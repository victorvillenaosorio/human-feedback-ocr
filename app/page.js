'use client';
import { useState, useEffect, useRef } from 'react';
import { fabric } from 'fabric';
import * as pdfjsLib from 'pdfjs-dist/build/pdf';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.entry';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export default function Home() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const canvasRef = useRef(null);

  const handleFileChange = (e) => {
    setSelectedFile(e.target.files[0]);
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
  const renderPdfWithBoxes = async (file, result) => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    const fileReader = new FileReader();

    fileReader.onload = async function () {
      const pdfData = new Uint8Array(this.result);
      const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
      const page = await pdf.getPage(1); // Renderizar la primera página

      const viewport = page.getViewport({ scale: 1 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      await page.render(renderContext).promise;

      // Superponer recuadros desde el JSON de resultados
      const fabricCanvas = new fabric.Canvas(canvasRef.current);
      result.fields.forEach((field) => {
        const { boundingBox, label } = field;
        const [x, y, width, height] = boundingBox;

        const rect = new fabric.Rect({
          left: x * canvas.width,
          top: y * canvas.height,
          width: width * canvas.width,
          height: height * canvas.height,
          fill: 'rgba(0, 0, 255, 0.1)',
          stroke: 'blue',
          strokeWidth: 2,
          selectable: true,
        });

        const text = new fabric.Text(label, {
          left: x * canvas.width,
          top: (y * canvas.height) - 20, // Ajustar el texto arriba del recuadro
          fontSize: 16,
          fill: 'blue',
        });

        fabricCanvas.add(rect);
        fabricCanvas.add(text);
      });
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
      <div style={{ width: '50%' }}>
        <h3>Vista previa del documento</h3>
        <canvas ref={canvasRef} style={{ border: '1px solid black' }}></canvas>
      </div>
    </div>
  );
}
