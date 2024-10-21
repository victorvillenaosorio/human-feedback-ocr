import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os'; // Importar para obtener el directorio temporal
import axios from 'axios';

const azureEndpoint = "https://dua-ocr.cognitiveservices.azure.com";
const subscriptionKey = "8d5b87e8b719464dbabee477346fc113";
const modelId = "EuropeanExportDUAModel";
const pollingInterval = 2000; // Tiempo de espera entre cada consulta (2 segundos)

// Especificar que no es una función edge
export const runtime = 'nodejs'; 

export async function POST(req) {
  try {
    // Leer el archivo del formData
    const formData = await req.formData();
    const file = formData.get('document');
    
    // Guardar temporalmente el archivo en un directorio temporal
    const buffer = Buffer.from(await file.arrayBuffer());
    const tempDir = os.tmpdir(); // Obtener el directorio temporal
    const filePath = path.join(tempDir, file.name); // Crear la ruta del archivo temporal

    fs.writeFileSync(filePath, buffer);

    // Subir el archivo a Azure
    const response = await axios({
      method: 'post',
      url: `${azureEndpoint}/formrecognizer/documentModels/${modelId}:analyze?api-version=2023-07-31`,
      headers: {
        'Ocp-Apim-Subscription-Key': subscriptionKey,
        'Content-Type': 'application/octet-stream',
      },
      data: fs.readFileSync(filePath),  // Enviar el archivo a Azure
    });

    const operationLocation = response.headers['operation-location'];

    if (!operationLocation) {
      throw new Error('No se pudo obtener la URL de operación.');
    }

    // Función para verificar el estado del análisis
    const checkStatus = async () => {
      let analysisResult;
      let status = "running";

      while (status === "running") {
        await new Promise(resolve => setTimeout(resolve, pollingInterval)); // Esperar 2 segundos entre cada verificación

        const result = await axios.get(operationLocation, {
          headers: {
            'Ocp-Apim-Subscription-Key': subscriptionKey,
          },
        });

        status = result.data.status;

        if (status === "succeeded") {
          analysisResult = result.data.analyzeResult; // Guardar el resultado cuando esté listo
        }
      }

      if (status !== "succeeded") {
        throw new Error('Error al procesar el documento o el análisis falló.');
      }

      return analysisResult;
    };

    // Llamar a la función para verificar el estado hasta que esté listo
    const analysisResult = await checkStatus();

    // Devolver el resultado del análisis
    return NextResponse.json({ result: analysisResult });

  } catch (error) {
    console.error('Error procesando el archivo:', error);
    return NextResponse.json({ error: 'Error procesando el documento' }, { status: 500 });
  }
}
