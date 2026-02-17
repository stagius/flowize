import { GoogleGenAI, Type } from "@google/genai";
import { TaskItem, TaskStatus } from "../types";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

// Helper to generate a unique ID
const generateId = () => Math.random().toString(36).substring(2, 9);

export const analyzeAndFormatTasks = async (rawInput: string): Promise<TaskItem[]> => {
  if (!apiKey) {
    throw new Error('Gemini API key is not configured. Set API_KEY (or VITE_API_KEY in client env).');
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
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
    console.error("Gemini API Error:", error);
    throw new Error(`Failed to analyze tasks with Gemini: ${error instanceof Error ? error.message : String(error)}`);
  }
};

export const generateImplementation = async (task: TaskItem): Promise<string> => {
  if (!apiKey) {
    throw new Error('Gemini API key is not configured. Set API_KEY (or VITE_API_KEY in client env).');
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are an expert senior software engineer. 
      Generate a technical implementation plan and a small code snippet for the following task.
      Keep it concise (markdown format).
      
      Task: ${task.title}
      Description: ${task.description}
      Context: React, TypeScript, Tailwind project.`,
    });
    return response.text || "No implementation generated.";
  } catch (error) {
    console.error("Gemini Impl Error:", error);
    throw new Error(`Failed to generate implementation with Gemini: ${error instanceof Error ? error.message : String(error)}`);
  }
};
