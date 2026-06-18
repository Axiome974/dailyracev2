// Tant que firebaseConfig vaut null, l'app tourne en mode local uniquement
// (localStorage), sans aucun appel reseau. Pour activer le multijoueur :
//
// 1. Cree un projet sur https://console.firebase.google.com
// 2. Active "Realtime Database" (mode "verrouille") et "Authentication" >
//    "Sign-in method" > "Anonymous"
// 3. Project settings > General > "Your apps" > Web app > copie le config
//    object ci-dessous
// 4. Colle les regles de assets/js/firebase.rules.json dans
//    Realtime Database > Rules
export const firebaseConfig = null;

// Exemple a decommenter et completer avec tes propres valeurs :
// export const firebaseConfig = {
//     apiKey: "...",
//     authDomain: "<project-id>.firebaseapp.com",
//     databaseURL: "https://<project-id>-default-rtdb.<region>.firebasedatabase.app",
//     projectId: "<project-id>",
// };
