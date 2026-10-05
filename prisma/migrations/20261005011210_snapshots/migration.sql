-- CreateTable
CREATE TABLE "Snapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "portfolioId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "cashCad" REAL NOT NULL,
    "cashUsd" REAL NOT NULL,
    "targetCashCad" REAL NOT NULL,
    "targetCashUsd" REAL NOT NULL,
    "usdCad" REAL,
    "pricesAsOf" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Snapshot_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SnapshotAsset" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "snapshotId" INTEGER NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "targetPercent" REAL NOT NULL,
    "units" REAL NOT NULL,
    "position" INTEGER NOT NULL,
    "price" REAL,
    CONSTRAINT "SnapshotAsset_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
