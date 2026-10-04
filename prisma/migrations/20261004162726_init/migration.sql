-- CreateTable
CREATE TABLE "Portfolio" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL DEFAULT 'My portfolio',
    "cashCad" REAL NOT NULL DEFAULT 0,
    "cashUsd" REAL NOT NULL DEFAULT 0,
    "targetCashCad" REAL NOT NULL DEFAULT 0,
    "targetCashUsd" REAL NOT NULL DEFAULT 0,
    "allowSells" BOOLEAN NOT NULL DEFAULT true,
    "usdCad" REAL,
    "usdCadSource" TEXT,
    "usdCadAsOf" DATETIME,
    "pricesAsOf" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "portfolioId" INTEGER NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "currency" TEXT NOT NULL,
    "targetPercent" REAL NOT NULL,
    "units" REAL NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "price" REAL,
    "priceSource" TEXT,
    "priceAsOf" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Asset_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Asset_portfolioId_symbol_currency_key" ON "Asset"("portfolioId", "symbol", "currency");
