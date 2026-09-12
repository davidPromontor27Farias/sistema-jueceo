-- AlterEnum
BEGIN;
CREATE TYPE "Categoria_new" AS ENUM ('KIDS_AMATEUR', 'KIDS_BOYS', 'KIDS_GIRL', 'JUVENIL_BOYS', 'JUVENIL_GIRL', 'BGIRLS', 'BBOYS', 'PUBLICO_GENERAL', 'OPEN_STYLE_1V1');
ALTER TABLE "estado_categorias" ALTER COLUMN "categoria" TYPE "Categoria_new" USING ("categoria"::text::"Categoria_new");
ALTER TABLE "enfrentamientos" ALTER COLUMN "categoria" TYPE "Categoria_new" USING ("categoria"::text::"Categoria_new");
ALTER TABLE "pantalla_estado" ALTER COLUMN "categoriaEnfocada" TYPE "Categoria_new" USING ("categoriaEnfocada"::text::"Categoria_new");
ALTER TABLE "registrations" ALTER COLUMN "categoria" TYPE "Categoria_new" USING ("categoria"::text::"Categoria_new");
ALTER TYPE "Categoria" RENAME TO "Categoria_old";
ALTER TYPE "Categoria_new" RENAME TO "Categoria";
DROP TYPE "Categoria_old";
COMMIT;
