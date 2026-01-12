import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';

function getDefaultLogsDir() {
    const currentFilePath = fileURLToPath(import.meta.url);
    const currentDir = path.dirname(currentFilePath);
    return path.resolve(currentDir, '../../logs');
}

export async function clearTxtLogs(logsDir = getDefaultLogsDir()) {
    try {
        const entries = await fs.readdir(logsDir, { withFileTypes: true });

        const txtFiles = entries
            .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.txt'))
            .map((entry) => path.join(logsDir, entry.name));

        await Promise.all(
            txtFiles.map(async (filePath) => {
                try {
                    await fs.unlink(filePath);
                } catch (error) {
                    if (error?.code !== 'ENOENT') throw error;
                }
            })
        );

        return { deleted: txtFiles.length, logsDir };
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return { deleted: 0, logsDir };
        }
        throw error;
    }
}

