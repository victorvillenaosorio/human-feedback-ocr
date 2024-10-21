import axios from 'axios';

const azureEndpoint = "https://dua-ocr.cognitiveservices.azure.com";
const subscriptionKey = "8d5b87e8b719464dbabee477346fc113";

export async function POST(req) {
  const body = await req.json();
  const { correctedData, documentPath } = body;

  try {
    const response = await axios({
      method: 'post',
      url: `${azureEndpoint}/formrecognizer/documentModels:build?api-version=2023-07-31`,
      headers: {
        'Ocp-Apim-Subscription-Key': subscriptionKey,
        'Content-Type': 'application/json',
      },
      data: {
        source: documentPath,
        useLabelFile: true,
        correctedData,
      },
    });

    return new Response(JSON.stringify(response.data), { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: 'Error reentrenando el modelo' }), { status: 500 });
  }
}
