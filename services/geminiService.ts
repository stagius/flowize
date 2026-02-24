import { GoogleGenAI, Type } from "@google/genai";
import { TaskItem, TaskStatus } from "../types";

const generateId = () => Math.random().toString(36).substring(2, 9);

const FALLBACK_MODELS = [
  'gemini-2.5-flash',
  'gemini-3-flash-preview',
  'gemini-2.5-flash-lite'
];

export const analyzeAndFormatTasks = async (rawInput: string, model: string = 'gemini-3-flash-preview', apiKey?: string): Promise<TaskItem[]> => {
  const key = apiKey || process.env.API_KEY || '';
  
  if (!key) {
    throw new Error('Gemini API key is not configured. Set API_KEY (or VITE_API_KEY in client env) or configure it in Settings.');
  }

  const ai = new GoogleGenAI({ apiKey: key });

  // Build the model list: primary model first, then fallbacks (excluding the primary if it's already in the list)
  const modelsToTry = [model, ...FALLBACK_MODELS.filter(m => m !== model)];
  let lastError: Error | null = null;

  for (let i = 0; i < modelsToTry.length; i++) {
    const currentModel = modelsToTry[i];
    
    try {
      if (i > 0) {
        console.log(`Auto-switching to fallback model: ${currentModel} (attempt ${i + 1}/${modelsToTry.length})`);
      }

      const response = await ai.models.generateContent({
        model: currentModel,
        contents: `Analyze the following raw input of software tasks/bugs/features. 
        Break them down into individual actionable items. 
        Group them logically (e.g., 'Auth', 'UI', 'Backend', 'Refactor').
        Assign a priority (High, Medium, Low) based on context (bugs are usually High).
        Provide a concise title and a detailed technical description for a GitHub issue.
        
        Raw Input:
        "${rawInput}"`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                group: { type: Type.STRING },
                priority: { type: Type.STRING, enum: ["High", "Medium", "Low"] }
              },
              required: ["title", "description", "group", "priority"]
            }
          }
        }
      });

      const parsed = JSON.parse(response.text || "[]");
      
      if (i > 0) {
        console.log(`Successfully analyzed tasks with fallback model: ${currentModel}`);
      }

      return parsed.map((item: any) => ({
        id: generateId(),
        rawText: rawInput.substring(0, 50) + "...", // Keep a ref
        title: item.title,
        description: item.description,
        group: item.group,
        priority: item.priority,
        status: TaskStatus.FORMATTED,
        createdAt: Date.now()
      }));

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Gemini API Error with model ${currentModel}:`, error);
      
      // If this is not the last model, continue to the next one
      if (i < modelsToTry.length - 1) {
        console.log(`Retrying with next fallback model...`);
        continue;
      }
    }
  }

  // If we've exhausted all models, throw the last error
  throw new Error(`Failed to analyze tasks with all available Gemini models. Last error: ${lastError?.message || 'Unknown error'}`);
};
