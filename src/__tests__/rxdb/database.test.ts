import { describe, it, expect, afterEach } from "vitest";
import { createAppDatabase, type AppDatabase } from "../../storage/rxdb/database";

describe("createAppDatabase", () => {
  let db: AppDatabase | null = null;

  afterEach(async () => {
    if (db) {
      await db.close();
      db = null;
    }
  });

  it("creates a database with notes and images collections", async () => {
    db = await createAppDatabase("test-user-123");
    expect(db.notes).toBeDefined();
    expect(db.images).toBeDefined();
  });

  it("notes collection has correct schema properties", async () => {
    db = await createAppDatabase("test-user-456");
    const schema = db.notes.schema.jsonSchema;
    expect(schema.primaryKey).toBe("date");
    expect(schema.properties).toHaveProperty("content");
    expect(schema.properties).toHaveProperty("updatedAt");
    expect(schema.properties).toHaveProperty("isDeleted");
  });

  it("images collection has correct schema properties", async () => {
    db = await createAppDatabase("test-user-789");
    const schema = db.images.schema.jsonSchema;
    expect(schema.primaryKey).toBe("id");
    expect(schema.properties).toHaveProperty("noteDate");
    expect(schema.properties).toHaveProperty("filename");
    expect(schema.properties).toHaveProperty("mimeType");
    expect(schema.properties).toHaveProperty("isDeleted");
  });

  it("images collection supports attachments", async () => {
    db = await createAppDatabase("test-user-att");
    expect(db.images.schema.jsonSchema.attachments).toBeDefined();
  });
});
