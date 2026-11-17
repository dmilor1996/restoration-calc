#!/usr/bin/env bash
# Пересборка локальной копии Firebase SDK (js/vendor/firebase.js), чтобы сайт и приложение работали без CDN.
set -euo pipefail
dir=$(mktemp -d); cd "$dir"
npm init -y >/dev/null && npm i firebase@10.14.1 esbuild >/dev/null
cat > entry.js <<'JS'
export { initializeApp } from 'firebase/app';
export { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, signInWithCredential } from 'firebase/auth';
export { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, onSnapshot, doc, collection, setDoc } from 'firebase/firestore';
JS
npx esbuild entry.js --bundle --format=esm --minify --outfile=out.js
cp out.js "$OLDPWD/js/vendor/firebase.js"
