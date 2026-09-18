-- AlterTable
ALTER TABLE "enfrentamientos" ADD COLUMN     "rondaNumero" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "estado_categorias" ADD COLUMN     "totalRondas" INTEGER;
