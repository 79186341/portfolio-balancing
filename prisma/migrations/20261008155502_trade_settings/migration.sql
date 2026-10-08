-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Portfolio" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL DEFAULT 'My portfolio',
    "cashCad" REAL NOT NULL DEFAULT 0,
    "cashUsd" REAL NOT NULL DEFAULT 0,
    "targetCashCad" REAL NOT NULL DEFAULT 0,
    "targetCashUsd" REAL NOT NULL DEFAULT 0,
    "allowSells" BOOLEAN NOT NULL DEFAULT true,
    "allowConversion" BOOLEAN NOT NULL DEFAULT true,
    "allowFractional" BOOLEAN NOT NULL DEFAULT false,
    "usdCad" REAL,
    "usdCadSource" TEXT,
    "usdCadAsOf" DATETIME,
    "pricesAsOf" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Portfolio" ("allowSells", "cashCad", "cashUsd", "createdAt", "id", "name", "pricesAsOf", "targetCashCad", "targetCashUsd", "updatedAt", "usdCad", "usdCadAsOf", "usdCadSource") SELECT "allowSells", "cashCad", "cashUsd", "createdAt", "id", "name", "pricesAsOf", "targetCashCad", "targetCashUsd", "updatedAt", "usdCad", "usdCadAsOf", "usdCadSource" FROM "Portfolio";
DROP TABLE "Portfolio";
ALTER TABLE "new_Portfolio" RENAME TO "Portfolio";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
