-- CreateTable
CREATE TABLE "Dict" (
    "word" TEXT NOT NULL PRIMARY KEY,
    "phonetic" TEXT,
    "entriesJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
