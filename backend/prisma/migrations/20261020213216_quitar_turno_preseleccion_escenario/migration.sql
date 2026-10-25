-- DropForeignKey
ALTER TABLE "turnos_preseleccion_escenario" DROP CONSTRAINT "turnos_preseleccion_escenario_escenarioId_fkey";

-- DropForeignKey
ALTER TABLE "turnos_preseleccion_escenario" DROP CONSTRAINT "turnos_preseleccion_escenario_turnoActualId_fkey";

-- DropTable
DROP TABLE "turnos_preseleccion_escenario";
