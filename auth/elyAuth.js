const axios = require("axios");
const fs = require("fs"); // Importar File System
const path = require("path"); // Importar Path

// Ruta donde se guardarán las credenciales (en el directorio raíz)
const AUTH_FILE = path.join(__dirname, '..', 'user_auth.json');

// ==========================================
// PERSISTENCIA DE CREDENCIALES
// ==========================================

/**
 * Guarda el email y la contraseña después de un login exitoso.
 * Advertencia: La contraseña no está cifrada.
 */
function saveAuthCredentials(email, password) {
    try {
        const authData = {
            lastEmail: email,
            lastPassword: password 
        };
        fs.writeFileSync(AUTH_FILE, JSON.stringify(authData, null, 2));
        console.log("[AuthManager] Credenciales guardadas en user_auth.json.");
    } catch (e) {
        console.error("[AuthManager] Error al guardar user_auth.json:", e);
    }
}

/**
 * Carga las credenciales guardadas para el autollenado.
 */
function loadAuthCredentials() {
    try {
        if (fs.existsSync(AUTH_FILE)) {
            const data = fs.readFileSync(AUTH_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error("[AuthManager] Error al cargar user_auth.json. Devolviendo vacío.", e);
    }
    return { lastEmail: "", lastPassword: "" };
}


// ==========================================
// FUNCIÓN DE LOGIN ELY (MODIFICADA)
// ==========================================
async function loginEly(email, password) {
    try {
        const res = await axios.post(
            "https://authserver.ely.by/auth/authenticate",
            {
                username: email,
                password: password,
                requestUser: true
            },
            {
                headers: { "Content-Type": "application/json" }
            }
        );

        // 1. Respuesta válida
        const user = {
            accessToken: res.data.accessToken,
            clientToken: res.data.clientToken,
            uuid: res.data.selectedProfile.id,
            name: res.data.selectedProfile.name
        };

        // 2. Guardar las credenciales después del éxito
        saveAuthCredentials(email, password);

        return user;

    } catch (err) {
        console.log("ERROR LOGIN ELY:", err.response?.data || err.message);
        throw new Error("Credenciales inválidas");
    }
}

module.exports = { loginEly, loadAuthCredentials };