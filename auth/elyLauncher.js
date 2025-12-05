const { Client } = require("minecraft-launcher-core");
const path = require("path");
const crypto = require("crypto"); 
const fs = require("fs"); 

// Rutas dinámicas eliminadas y serán pasadas por main.js

const VERSION = "1.20.1"; 
// El nombre del instalador de Forge se mantiene por referencia, pero la ruta es externa.
const FORGE_INSTALLER_NAME = "forge-1.20.1-47.4.10-installer.jar";


// ==========================================
// CONFIGURACIÓN POR DEFECTO DEL LAUNCHER
// ==========================================
const DEFAULT_CONFIG = {
    // Este valor ya no se usa para resolver la ruta de Java si se descarga, 
    // pero se mantiene para la configuración manual de memoria.
    javaPath: "jdk-17/bin/java.exe", 
    minMemory: "2G",
    maxMemory: "4G",
};

/**
 * Función auxiliar para esperar una cantidad de milisegundos.
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 🚨 La firma está correcta
function loadUserConfig(configPath) { 
    try {
        if (!fs.existsSync(configPath)) { 
            return DEFAULT_CONFIG;
        }
        const data = fs.readFileSync(configPath, 'utf8');
        return Object.assign({}, DEFAULT_CONFIG, JSON.parse(data)); 
    } catch (error) {
        console.error("[CONFIG ERROR] Error al cargar la configuración:", error);
        return DEFAULT_CONFIG;
    }
}

// 🚨 La firma está correcta
function saveUserConfig(config, configPath) {
    try {
        const configToSave = {
            javaPath: config.javaPath,
            minMemory: config.minMemory,
            maxMemory: config.maxMemory
        };
        fs.writeFileSync(configPath, JSON.stringify(configToSave, null, 2), 'utf8'); 
        return { success: true, message: "Configuración guardada con éxito." };
    } catch (error) {
        console.error("[CONFIG ERROR] Error al guardar la configuración:", error);
        return { success: false, message: `Error al guardar: ${error.message}` };
    }
}


function generateOfflineUser(input) {
    let usernameString;
    if (typeof input === 'string' && input.length > 0) {
        usernameString = input;
    } else if (typeof input === 'object' && input !== null && input.name) {
        usernameString = input.name;
    } else {
        usernameString = 'LauncherUser'; 
    }
    const hash = crypto.createHash('md5').update(usernameString).digest('hex');
    const uuid = hash.substr(0, 8) + '-' + hash.substr(8, 4) + '-' + hash.substr(12, 4) + '-' + hash.substr(16, 4) + '-' + hash.substr(20, 12);
    return {
        access_token: "fake-token", 
        client_token: "fake-client",
        uuid: uuid,
        name: usernameString,
    };
}


const safeSend = (targetWindow, channel, ...args) => {
    
    if (targetWindow && targetWindow.webContents && typeof targetWindow.webContents.send === 'function') {
        targetWindow.webContents.send(channel, ...args);
    } else {
        console.warn(`[Launcher]: No se pudo enviar mensaje a la UI. Ventana cerrada/inválida. Mensaje: ${args[0]}`);
    }
};


// 🚨 ACTUALIZADO: AHORA recibe la ruta de Minecraft (en userData)
function writeSkinsRestorerConfig(minecraftDir) {
    const configDir = path.join(minecraftDir, "config");
    const configFile = path.join(configDir, "SkinsRestorer.json"); 

    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
        console.log(`[SkinsRestorer Config] Carpeta de configuración creada.`);
    }
    const configContent = {
        "language": "en_us",
        "refreshSkinOnJoin": true,
        "skinApplyDelayOnJoin": 15000, 
        "fetchSkinOnFirstJoin": true,
        "firstJoinSkinProvider": "ELY.BY", 
        "proxy": "",
        "requestTimeout": 10,
        "providers": {
            "mojang": { "enabled": false, "name": "mojang", "cache": { "enabled": false, "duration": 60 } },
            "ely_by": { "enabled": true, "name": "ely.by", "cache": { "enabled": true, "duration": 60 } },
            "mineskin": { "apiKey": "", "enabled": false, "name": "web", "cache": { "enabled": false, "duration": 300 } }
        }
    };

    try {
        fs.writeFileSync(configFile, JSON.stringify(configContent, null, 2));
        console.log("Configuración de SkinsRestorer actualizada y escrita exitosamente.");
    } catch (e) {
        console.error("Error al escribir el archivo de configuración de SkinsRestorer:", e);
    }
}


// ==========================================
// FUNCIÓN PRINCIPAL: LANZAR MINECRAFT (Actualizada para rutas dinámicas)
// ==========================================
// 🚨 CRÍTICO: Recibe las rutas dinámicas como argumentos
async function launchMinecraft(userOrUsername, targetWindow, minecraftDir, configPath, absoluteForgePath, javaExePath) { 
    
    let launchResult = null; 

    try {
        console.log("== PREPARANDO LANZAMIENTO Y CONFIGURACIÓN DE SKINS ==");
        console.log(`[LAUNCH] Directorio de Minecraft: ${minecraftDir}`); 
        
        const config = loadUserConfig(configPath); // Pasa la ruta de la config
        writeSkinsRestorerConfig(minecraftDir); // Pasa la ruta de Minecraft

        // 1. RESOLVER RUTA DE JAVA PARA PORTABILIDAD (Lógica antigua ELIMINADA)
        // 🔑 Usamos directamente la ruta absoluta que nos pasó main.js
        const absoluteJavaPath = javaExePath;
        
        console.log(`[JAVA CHECK] Ruta de Java Final: ${absoluteJavaPath}`); 
        console.log(`[FORGE CHECK] Ruta de Forge Final: ${absoluteForgePath}`);
        
        const AUTH_USER = generateOfflineUser(userOrUsername); 
        const launcher = new Client();
        
        // --- MANEJO DE EVENTOS ---
        
        launcher.on('data', (data) => {
            const log = data.toString().trim();
            safeSend(targetWindow, 'mc-output', `[GAME-LOG] ${log}`); 
        });
        
        launcher.on('error', (err) => {
            const errMsg = err.message || err;
            safeSend(targetWindow, 'mc-output', `[GAME-ERROR] ${errMsg}`);
            console.error(`[LAUNCHER ERROR] ${errMsg}`);
        });

        // 3. MANEJO DE PROGRESO (SOLO LOGGING, SIN LÓGICA DE CIERRE)
        launcher.on('progress', (p) => {
            const percent = Math.round((p.task / p.total) * 100);
            const logMessage = `[DESCARGANDO] Tipo: ${p.type} | Progreso: ${percent}% | Archivo: ${p.file}`;
            
            safeSend(targetWindow, 'mc-progress', { 
                type: 'download', 
                file: p.file, 
                task: p.task, 
                total: p.total, 
                progress: percent,
                message: `Descargando: ${p.file}`
            });
            safeSend(targetWindow, 'mc-output', logMessage);
            console.log(logMessage);

            // 🚫 No hay lógica de detección de 100% ni cierre aquí.
        });


        const opts = {
            authorization: AUTH_USER, 
            root: minecraftDir, // 🚨 CRÍTICO: Usa la ruta pasada por main.js
            forge: absoluteForgePath, // 🔑 Usa la ruta de Forge recibida
            version: {
                number: VERSION, 
                type: "forge", 
            },
            javaPath: absoluteJavaPath, // 🔑 Usa la ruta de Java recibida
            memory: { 
                min: config.minMemory,
                max: config.maxMemory 
            },
            customArgs: [
                // Argumentos JVM para skins
                '-Dminecraft.api.url=http://skinsystem.ely.by/', 
                '-Dsession.servers=http://skinsystem.ely.by', 
                '-Dtextures.servers=http://skinsystem.ely.by',
                
                // Argumentos de Java originales
                "-XX:+ShowCodeDetailsInExceptionMessages",
                "--add-opens=java.base/java.lang.reflect=ALL-UNNAMED",
                "--add-opens=java.base/java.lang.invoke=ALL-UNNAMED",
                "--add-opens=java.base/java.util.concurrent.atomic=ALL-UNNAMED",
                "--add-opens=java.base/java.io=ALL-UNNAMED",
                "--add-opens=java.base/java.security=ALL-UNNAMED",
                "--add-exports=java.base/sun.security.util=ALL-UNNAMED",
                "--add-exports=java.base/sun.nio.fs=ALL-UNNAMED"
            ]
        };

        
        
        // 4. LANZAR EL JUEGO 
        try {
            launchResult = await launcher.launch(opts);
        } catch (err) {
            console.warn("Lanzador finalizado con error (se asume que el juego arrancó):", err.message);
        }
        
        // === CORRECCIÓN DE MINIMIZACIÓN ===
        if (targetWindow && !targetWindow.isDestroyed()) {
             if (!targetWindow.isVisible()) {
                 targetWindow.show();
             }
             targetWindow.focus();
        }
        
        // 🔑 Garantizamos un retorno
        return { success: true }; 
        


    } catch (err) { 
        console.error("ERROR CRÍTICO INESPERADO AL PREPARAR EL LANZAMIENTO:", err);
        safeSend(targetWindow, 'mc-output', `[CRITICAL-LAUNCHER-ERROR] Error inesperado: ${err.message}`);
        
        if (targetWindow && !targetWindow.isDestroyed()) {
             targetWindow.show();
             targetWindow.focus();
        }
        throw err;
    }
}

module.exports = { 
    launchMinecraft,
    loadUserConfig, 
    saveUserConfig 
};