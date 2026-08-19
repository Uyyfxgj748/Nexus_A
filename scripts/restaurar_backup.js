const fs   = require('fs');
const path = require('path');

const DATA_DIR    = path.join(__dirname, '../data');
const BACKUP_DIR  = path.join(DATA_DIR, 'backups');

// Archivos críticos que deben restaurarse si faltan o están vacíos
const ARCHIVOS_CRITICOS = [
    'users.json',
    'grupos.json',
    'clanes.json',
    'estado.json',
    'tempbans.json',
    'chests.json',
    'owners.json',
    'tienda.json',
];

function obtenerBackupMasReciente() {
    if (!fs.existsSync(BACKUP_DIR)) return null;
    const carpetas = fs.readdirSync(BACKUP_DIR)
        .filter(n => fs.statSync(path.join(BACKUP_DIR, n)).isDirectory())
        .sort()
        .reverse();
    return carpetas.length > 0 ? path.join(BACKUP_DIR, carpetas[0]) : null;
}

function archivoVacioOAusente(rutaArchivo) {
    if (!fs.existsSync(rutaArchivo)) return true;
    const stat = fs.statSync(rutaArchivo);
    if (stat.size === 0) return true;
    try {
        const contenido = fs.readFileSync(rutaArchivo, 'utf8').trim();
        return contenido === '' || contenido === '{}' || contenido === '[]';
    } catch {
        return true;
    }
}

function restaurarDesdeBackup() {
    const backupDir = obtenerBackupMasReciente();

    if (!backupDir) {
        console.log('📦 [Restaurar] No hay backups disponibles, arrancando limpio.');
        return;
    }

    let restaurados = 0;

    for (const archivo of ARCHIVOS_CRITICOS) {
        const destino = path.join(DATA_DIR, archivo);
        const origen  = path.join(backupDir, archivo);

        if (archivoVacioOAusente(destino)) {
            if (fs.existsSync(origen)) {
                fs.copyFileSync(origen, destino);
                const kb = (fs.statSync(destino).size / 1024).toFixed(1);
                console.log(`✅ [Restaurar] ${archivo} recuperado desde backup (${kb} KB)`);
                restaurados++;
            } else {
                console.log(`⚠️  [Restaurar] ${archivo} no está en el backup más reciente, se creará vacío.`);
            }
        }
    }

    if (restaurados === 0) {
        console.log(`📦 [Restaurar] Todos los archivos están presentes. Backup: ${path.basename(backupDir)}`);
    } else {
        console.log(`📦 [Restaurar] ${restaurados} archivo(s) recuperado(s) desde: ${path.basename(backupDir)}`);
    }
}

// Si se ejecuta directamente (node scripts/restaurar_backup.js)
if (require.main === module) {
    console.log('🔄 Restaurando datos desde el backup más reciente...\n');
    restaurarDesdeBackup();
}

module.exports = { restaurarDesdeBackup };
