import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyDAyFfdnjLW96WXjBXGUH32kQ7fVmNBv-k",
    authDomain: "fuego-y-sazon.firebaseapp.com",
    projectId: "fuego-y-sazon",
    storageBucket: "fuego-y-sazon.firebasestorage.app",
    messagingSenderId: "405591769496",
    appId: "1:405591769496:web:fb7fa0d41b778454316bed",
    measurementId: "G-ZSV6TSHTZR"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);