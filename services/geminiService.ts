import { GoogleGenAI, Type } from "@google/genai";
import { TaskItem, TaskStatus } from "../types";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

// Helper to generate a unique ID
const generateId = () => Math.random().toString(36).substring(2, 9);

export const analyzeAndFormatTasks = async (rawInput: string): Promise<TaskItem[]> => {
  if (!apiKey) {
    console.warn("No API Key provided, returning mock data");
    return mockAnalyze(rawInput);
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
    return mockAnalyze(rawInput);
  }
};

export const generateImplementation = async (task: TaskItem): Promise<string> => {
  if (!apiKey) return mockImplementation(task);

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
    return mockImplementation(task);
  }
};

// Fallbacks if API fails or key missing
const mockAnalyze = (input: string): TaskItem[] => {
  return [
    {
      id: generateId(),
      rawText: input,
      title: "Fix Login Button State",
      description: "The login button doesn't show loading state when clicked on mobile devices.",
      group: "Authentication",
      priority: "High",
      status: TaskStatus.FORMATTED,
      createdAt: Date.now()
    },
    {
      id: generateId(),
      rawText: input,
      title: "Add Dark Mode Toggle",
      description: "Implement a system-aware dark mode toggle in the header.",
      group: "UI/UX",
      priority: "Medium",
      status: TaskStatus.FORMATTED,
      createdAt: Date.now()
    }
  ];
};

const mockImplementation = (task: TaskItem): string => {
  return `### Plan for ${task.title}
1. Locate the component.
2. Add state variable.
3. Update CSS classes.

\`\`\`tsx
// Example change
const [isLoading, setIsLoading] = useState(false);
return <Button disabled={isLoading}>Login</Button>;
\`\`\`
`;
};
