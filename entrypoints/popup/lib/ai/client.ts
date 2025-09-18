import { GoogleGenAI } from '@google/genai'

const DEFAULT_MODEL = 'gemini-2.5-flash'

export const getDefaultModel = (override?: string) => override ?? DEFAULT_MODEL

export const createGeminiClient = async () => {
  const { geminiApiKey } = await browser.storage.local.get('geminiApiKey')
  const apiKey = (geminiApiKey as string | undefined)?.trim()
  if (!apiKey)
    throw new Error('Gemini API key not set. Open the popup and Save your key.')

  return new GoogleGenAI({ apiKey })
}
