import type { RxJsonSchema } from "rxdb";

export interface NoteDocType {
  date: string;
  content: string;
  updatedAt: string;
  deleted: boolean;
  weather?: {
    icon: string;
    temperatureHigh: number;
    temperatureLow: number;
    unit: "C" | "F";
    city: string;
  } | null;
}

export interface ImageDocType {
  id: string;
  noteDate: string;
  type: "background" | "inline";
  filename: string;
  mimeType: string;
  width: number;
  height: number;
  size: number;
  createdAt: string;
  deleted: boolean;
}

export const noteSchema: RxJsonSchema<NoteDocType> = {
  version: 0,
  primaryKey: "date",
  type: "object",
  properties: {
    date: { type: "string", maxLength: 10 },
    content: { type: "string" },
    updatedAt: { type: "string" },
    deleted: { type: "boolean" },
    weather: {
      type: ["object", "null"],
      properties: {
        icon: { type: "string" },
        temperatureHigh: { type: "number" },
        temperatureLow: { type: "number" },
        unit: { type: "string", enum: ["C", "F"] },
        city: { type: "string" },
      },
    },
  },
  required: ["date", "content", "updatedAt", "deleted"],
};

export const imageSchema: RxJsonSchema<ImageDocType> = {
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 36 },
    noteDate: { type: "string", maxLength: 10 },
    type: { type: "string", enum: ["background", "inline"] },
    filename: { type: "string" },
    mimeType: { type: "string" },
    width: { type: "number" },
    height: { type: "number" },
    size: { type: "number" },
    createdAt: { type: "string" },
    deleted: { type: "boolean" },
  },
  required: [
    "id", "noteDate", "type", "filename", "mimeType",
    "width", "height", "size", "createdAt", "deleted",
  ],
  indexes: ["noteDate"],
  attachments: {},
};
