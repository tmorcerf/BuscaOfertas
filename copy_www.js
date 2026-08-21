/**
 * copy_www.js — Copia os arquivos do frontend para a pasta www/ usada pelo Capacitor
 */
import fs from 'fs';
import path from 'path';

const SRC_DIR = process.cwd();
const WWW_DIR = path.join(SRC_DIR, 'www');

function copyRecursive(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.name === 'node_modules' || entry.name === 'android' || entry.name === 'www' || entry.name === '.git') {
            continue;
        }

        if (entry.isDirectory()) {
            copyRecursive(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

console.log('[Build] Copiando arquivos para www/...');
copyRecursive(SRC_DIR, WWW_DIR);
console.log('[Build] Pasta www/ atualizada com sucesso!');
