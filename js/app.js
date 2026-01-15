import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, addDoc, updateDoc, deleteDoc, onSnapshot, collection, setDoc, increment, getDoc, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- CONFIGURACIÓN FIREBASE ---
const app = initializeApp({ apiKey: "AIzaSyDahnSPvBNTYot00JCn5CBjggAYFVGhbjE", authDomain: "panel-logistica-simple.firebaseapp.com", projectId: "panel-logistica-simple", storageBucket: "panel-logistica-simple.firebasestorage.app", messagingSenderId: "528779971851", appId: "1:528779971851:web:29ed933e7c7fd997a4e60e" });
const auth = getAuth(app); const db = getFirestore(app);

const colArts = collection(db, 'requi_toolcrib', 'data', 'articles');
const colEmps = collection(db, 'requi_toolcrib', 'data', 'employees');
const colCats = collection(db, 'requi_toolcrib', 'data', 'categories');
const colLists = collection(db, 'requi_toolcrib', 'data', 'lists');
const colLogs = collection(db, 'requi_toolcrib', 'data', 'traffic_logs'); // Faltaba esta referencia

let artsMap = new Map(), empsMap = new Map(), catsMap = new Map(), listsMap = new Map();
let editingArtId = null, editingEmpId = null, confirmAction = null;
let currentUser = null;

const PLACEHOLDER_IMG = "https://placehold.co/400x400/f1f5f9/94a3b8?text=Sin+Imagen";

// --- FUNCIONES UTILITARIAS ---
const showToast = (msg, type = 'success') => {
    const t = document.createElement('div'); t.className = `toast toast-${type}`;
    t.innerHTML = `<div class="mr-3 font-bold">${type === 'error' ? '❌' : '✅'}</div><div class="text-sm font-medium">${msg}</div>`;
    document.getElementById('toast-container').appendChild(t);
    setTimeout(() => { t.classList.add('hiding'); setTimeout(() => t.remove(), 300) }, 3000);
};

window.closeModal = (id) => document.getElementById(id).classList.add('hidden');
const openModal = (id) => document.getElementById(id).classList.remove('hidden');
const askConfirm = (title, msg, action) => {
    document.getElementById('confirm-title').innerText = title;
    document.getElementById('confirm-message').innerText = msg;
    confirmAction = action;
    openModal('confirm-modal');
};
const navigateTo = (id) => {
    document.querySelectorAll('.screen-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
};

// --- AUTH & LISTENERS ---
onAuthStateChanged(auth, (u) => {
    currentUser = u;
    if(u) {
        document.getElementById('user-email-display').innerText = u.email;
        document.getElementById('btn-login-icon').classList.add('hidden');
        document.getElementById('btn-logout').classList.remove('hidden');
        navigateTo('admin-screen');
        loadData();
    } else {
        navigateTo('home-screen');
        document.getElementById('btn-login-icon').classList.remove('hidden');
        document.getElementById('btn-logout').classList.add('hidden');
    }
});

function loadData() {
    onSnapshot(colArts, (s) => { artsMap.clear(); s.forEach(d => artsMap.set(d.data().num, { ...d.data(), fbId: d.id })); renderArticulos(); });
    onSnapshot(colEmps, (s) => { empsMap.clear(); s.forEach(d => empsMap.set(d.data().id, { ...d.data(), fbId: d.id })); renderEmpleados(); });
    onSnapshot(colCats, (s) => {
        catsMap.clear(); const select = document.getElementById('admin-art-cat');
        const currentVal = select.value;
        select.innerHTML = '<option value="">Selecciona...</option>';
        s.forEach(d => { catsMap.set(d.data().name, d.id); select.innerHTML += `<option value="${d.data().name}">${d.data().name}</option>`; });
        select.value = currentVal;
        renderCategorias();
    });
    onSnapshot(colLists, (s) => { listsMap.clear(); s.forEach(d => listsMap.set(d.id, { name: d.data().name, fbId: d.id })); renderAdminLists(); });
    loadKPIs();
}

// --- KPI & LOGS (LECTURA Y ESCRITURA RESTAURADA) ---
function loadKPIs() {
    onSnapshot(doc(db, 'requi_toolcrib', 'stats'), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById('stats-total').innerText = (data.totalVisits || 0).toLocaleString();
            document.getElementById('stats-qr').innerText = (data.sources?.qr || 0).toLocaleString();
            document.getElementById('stats-direct').innerText = (data.sources?.direct || 0).toLocaleString();
        }
    });
    onSnapshot(query(colLogs, orderBy('timestamp', 'desc'), limit(10)), (s) => {
        const c = document.getElementById('stats-recent-logs');
        if(s.empty) c.innerHTML = '<div class="text-gray-400 italic text-center pt-2">Sin actividad.</div>';
        else c.innerHTML = s.docs.map(d => {
            const log = d.data();
            const timeStr = log.timestamp ? new Date(log.timestamp.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : log.hora;
            const icon = log.tipo === 'QR' ? '📱' : '💻';
            return `<div class="flex justify-between border-b pb-1 text-[10px] items-center"><div class="flex gap-2"><span>${icon}</span><span class="font-bold text-gray-700">${log.categoria}</span></div><span class="text-gray-400">${timeStr}</span></div>`;
        }).join('');
    });
}

// --- FUNCIÓN RESTAURADA: REGISTRAR TRÁFICO ---
async function registrarTrafico(categoriaQR = null) {
    const statsRef = doc(db, 'requi_toolcrib', 'stats');
    const ahora = new Date();
    try {
        await setDoc(statsRef, { lastUpdateCheck: ahora.toISOString() }, { merge: true });
        const updates = { totalVisits: increment(1), lastVisit: ahora.toISOString() };
        if (categoriaQR) {
            updates[`scans.${categoriaQR}`] = increment(1);
            updates['sources.qr'] = increment(1);
        } else {
            updates['sources.direct'] = increment(1);
        }
        await updateDoc(statsRef, updates);
        await addDoc(colLogs, {
            timestamp: ahora,
            fecha: ahora.toLocaleDateString('es-MX'),
            hora: ahora.toLocaleTimeString('es-MX'),
            tipo: categoriaQR ? 'QR' : 'Directo',
            categoria: categoriaQR || 'N/A',
            device: navigator.userAgent
        });
        console.log("📈 Log registrado.");
    } catch (error) { console.error("Error logs:", error); }
}

// --- GESTIÓN DE VARIANTES (LO NUEVO) ---
window.addVariantRow = (name = '', code = '') => {
    const container = document.getElementById('variants-list-container');
    const row = document.createElement('div');
    row.className = 'variant-row';
    row.innerHTML = `<input type="text" placeholder="Talla 32" value="${name}" class="variant-name-input variant-input"><input type="text" placeholder="BTA-T32" value="${code}" class="variant-code-input variant-input"><button type="button" onclick="this.parentElement.remove()" class="variant-btn-del">🗑️</button>`;
    container.appendChild(row);
};

const getVariantsData = () => {
    const variants = [];
    document.querySelectorAll('.variant-row').forEach(row => {
        const name = row.querySelector('.variant-name-input').value.trim();
        const code = row.querySelector('.variant-code-input').value.trim();
        if (name && code) variants.push({ name, code });
    });
    return variants;
};

document.getElementById('admin-art-hasVariants').addEventListener('change', (e) => {
    const panel = document.getElementById('admin-variants-panel');
    if (e.target.checked) {
        panel.classList.remove('hidden');
        if (document.getElementById('variants-list-container').children.length === 0) window.addVariantRow();
    } else {
        panel.classList.add('hidden');
    }
});

// --- ARTÍCULOS CRUD ---
document.getElementById('form-add-articulo').onsubmit = async (e) => {
    e.preventDefault();
    const num = document.getElementById('admin-art-num').value.trim();
    const nom = document.getElementById('admin-art-nom').value.trim();
    const cat = document.getElementById('admin-art-cat').value;
    const precio = parseFloat(document.getElementById('admin-art-precio').value) || 0;
    const img = document.getElementById('admin-art-img').value.trim();
    const hasVariants = document.getElementById('admin-art-hasVariants').checked;

    let variantsData = null;
    if (hasVariants) {
        variantsData = getVariantsData();
        if (variantsData.length === 0) return showToast('Agrega al menos una variante con código', 'error');
    }

    const assignedLists = [];
    document.querySelectorAll('#admin-art-lists input:checked').forEach(cb => assignedLists.push(cb.value));

    const data = { num, nom, cat, precio, img, hasVariants, variants: variantsData, assignedLists };

    try {
        if (editingArtId) {
            await updateDoc(doc(colArts, editingArtId), data);
            showToast('Artículo actualizado');
            cancelEditArticulo();
        } else {
            if (artsMap.has(num)) return showToast('El código ya existe', 'error');
            await addDoc(colArts, data);
            showToast('Artículo creado');
            e.target.reset();
            document.getElementById('admin-variants-panel').classList.add('hidden');
            document.getElementById('variants-list-container').innerHTML = '';
            renderArticuloListsCheckboxes();
        }
    } catch (err) { showToast('Error al guardar', 'error'); console.error(err); }
};

function renderArticulos() {
    const list = document.getElementById('admin-list-articulos');
    const term = document.getElementById('admin-art-search').value.toLowerCase();
    let items = Array.from(artsMap.values()).filter(a => a.num.toLowerCase().includes(term) || a.nom.toLowerCase().includes(term));
    items.sort((a,b) => a.nom.localeCompare(b.nom));

    if(items.length === 0) { list.innerHTML = '<div class="text-center p-10 text-gray-400">Sin resultados</div>'; return; }

    list.innerHTML = items.map(a => {
        const isComplex = Array.isArray(a.variants);
        const variantsBadge = a.hasVariants ? `<span class="bg-blue-100 text-blue-800 text-[10px] px-2 rounded">${isComplex ? a.variants.length + ' var' : 'Simple'}</span>` : '';
        return `<div class="bg-white p-3 rounded-lg border hover:border-blue-300 flex justify-between items-center group"><div><div class="flex gap-2 font-bold text-gray-800"><span>${a.nom}</span>${variantsBadge}</div><div class="text-xs text-gray-500 font-mono">${a.num} • $${a.precio}</div></div><div class="flex gap-2 opacity-0 group-hover:opacity-100"><button class="btn-edit text-blue-500" data-id="${a.fbId}">✏️</button><button class="btn-del text-red-500" data-id="${a.fbId}" data-n="${a.nom}">🗑️</button></div></div>`;
    }).join('');
}

// --- EDICIÓN ARTÍCULO ---
document.addEventListener('click', e => {
    const btn = e.target.closest('.btn-edit');
    if(btn) {
        const art = Array.from(artsMap.values()).find(a => a.fbId === btn.dataset.id);
        if(!art) return;
        editingArtId = art.fbId;
        document.getElementById('admin-art-num').value = art.num;
        document.getElementById('admin-art-original-num').value = art.num;
        document.getElementById('admin-art-nom').value = art.nom;
        document.getElementById('admin-art-cat').value = art.cat;
        document.getElementById('admin-art-precio').value = art.precio;
        document.getElementById('admin-art-img').value = art.img;

        const hasVarCheck = document.getElementById('admin-art-hasVariants');
        const varPanel = document.getElementById('admin-variants-panel');
        const varContainer = document.getElementById('variants-list-container');

        hasVarCheck.checked = art.hasVariants;
        varContainer.innerHTML = '';
        if (art.hasVariants) {
            varPanel.classList.remove('hidden');
            if (Array.isArray(art.variants)) art.variants.forEach(v => window.addVariantRow(v.name, v.code));
            else if (typeof art.variants === 'string') art.variants.split(',').forEach(v => window.addVariantRow(v.trim(), ''));
        } else { varPanel.classList.add('hidden'); }

        renderArticuloListsCheckboxes(art.assignedLists);
        document.getElementById('btn-cancel-art').classList.remove('hidden');
        document.getElementById('form-add-articulo').scrollIntoView({ behavior: 'smooth' });
    }
});

function cancelEditArticulo() {
    editingArtId = null;
    document.getElementById('form-add-articulo').reset();
    document.getElementById('btn-cancel-art').classList.add('hidden');
    document.getElementById('admin-variants-panel').classList.add('hidden');
    document.getElementById('variants-list-container').innerHTML = '';
    renderArticuloListsCheckboxes();
}

document.getElementById('btn-cancel-art').onclick = cancelEditArticulo;

// --- EMPLEADOS, CATS, LISTAS (Lógica intacta) ---
document.getElementById('form-add-empleado').onsubmit = async (e) => { e.preventDefault(); await addDoc(colEmps, { id: document.getElementById('admin-emp-id').value, nombre: document.getElementById('admin-emp-nombre').value }); e.target.reset(); };
document.getElementById('form-add-categoria').onsubmit = async (e) => { e.preventDefault(); await addDoc(colCats, { name: document.getElementById('admin-cat-name').value }); e.target.reset(); };
document.getElementById('form-add-list').onsubmit = async (e) => { e.preventDefault(); await addDoc(colLists, { name: document.getElementById('admin-list-name').value }); e.target.reset(); };
document.getElementById('admin-art-search').addEventListener('input', renderArticulos);

function renderEmpleados() { document.getElementById('admin-list-empleados').innerHTML = Array.from(empsMap.values()).map(e => `<div class="flex justify-between p-2 text-sm hover:bg-gray-50"><div><b>${e.id}</b> - ${e.nombre}</div><button class="text-red-500 btn-del-emp" data-id="${e.fbId}">×</button></div>`).join(''); }
function renderCategorias() { document.getElementById('admin-list-categorias').innerHTML = Array.from(catsMap.entries()).map(([name, id]) => `<div class="flex justify-between p-2 border-b"><span>${name}</span><div><button class="btn-qr mr-2" onclick="window.mostrarQR('${name}')">📱</button><button class="text-red-500 btn-del-cat" data-id="${id}">×</button></div></div>`).join(''); }
function renderAdminLists() { document.getElementById('admin-list-lists').innerHTML = Array.from(listsMap.values()).map(l => `<div class="flex justify-between p-2 border-b"><span>${l.name}</span><button class="text-red-500 btn-del-list" data-id="${l.fbId}">×</button></div>`).join(''); }
function renderArticuloListsCheckboxes(assigned = []) { document.getElementById('admin-art-lists').innerHTML = Array.from(listsMap.values()).map(l => `<div class="flex items-center"><input type="checkbox" value="${l.fbId}" ${assigned.includes(l.fbId)?'checked':''} class="mr-2"><span>${l.name}</span></div>`).join(''); }

// Eliminar
document.addEventListener('click', async e => {
    if(e.target.closest('.btn-del')) { if(confirm('¿Borrar?')) await deleteDoc(doc(colArts, e.target.closest('.btn-del').dataset.id)); }
    if(e.target.closest('.btn-del-cat')) await deleteDoc(doc(colCats, e.target.closest('.btn-del-cat').dataset.id));
    if(e.target.closest('.btn-del-emp')) await deleteDoc(doc(colEmps, e.target.closest('.btn-del-emp').dataset.id));
    if(e.target.closest('.btn-del-list')) await deleteDoc(doc(colLists, e.target.closest('.btn-del-list').dataset.id));
});

// --- FUNCIÓN RESTAURADA: CARGA DE EXCEL EMPLEADOS ---
document.getElementById('file-upload-emp').onchange = async (e) => {
    const f = e.target.files[0]; if(!f) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
        try {
            const wb = XLSX.read(evt.target.result, {type: 'binary'});
            const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header: 1});
            let count = 0;
            for(let i=0; i<data.length; i++) {
                if(data[i][0] && data[i][1] && !empsMap.has(data[i][0].toString())) {
                    await addDoc(colEmps, {id: data[i][0].toString(), nombre: data[i][1].toString()});
                    count++;
                }
            }
            showToast(`Cargados ${count} empleados`);
        } catch(err) { console.error(err); showToast('Error al leer archivo', 'error'); }
        e.target.value = '';
    };
    reader.readAsBinaryString(f);
};

// --- FUNCIÓN RESTAURADA: QR ---
window.mostrarQR = (cat) => {
    document.getElementById('qr-category-name').innerText = cat;
    document.getElementById('qrcode-container').innerHTML = '';
    new QRCode(document.getElementById('qrcode-container'), { text: window.location.href.split('?')[0] + '?categoria=' + encodeURIComponent(cat), width: 150, height: 150 });
    openModal('qr-modal');
};
window.imprimirQR = () => {
    const win = window.open('', '', 'height=500,width=500');
    win.document.write('<html><body style="text-align:center"><h2>'+document.getElementById('qr-category-name').innerText+'</h2>'+document.getElementById('qrcode-container').innerHTML+'</body></html>');
    win.document.close(); win.focus(); setTimeout(() => { win.print(); win.close(); }, 500);
};

// Login
document.getElementById('btn-login-icon').onclick = () => openModal('login-modal');
document.getElementById('form-login').onsubmit = async (e) => { e.preventDefault(); try { await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-pass').value); closeModal('login-modal'); } catch { showToast('Error login', 'error'); } };
document.getElementById('btn-logout').onclick = () => signOut(auth);
document.getElementById('btn-confirm-ok').onclick = () => { if(confirmAction) confirmAction(); closeModal('confirm-modal'); };

// Inicialización
function checkURLForQR() {
    const params = new URLSearchParams(window.location.search);
    const cat = params.get('categoria');
    if (cat) {
        showToast(`Modo QR: ${cat}`, 'info');
        registrarTrafico(cat); // Registra tráfico QR
    } else {
        registrarTrafico(null); // Registra tráfico directo
    }
}
function setInitialIcons() {
    const empIcon = document.getElementById('emp-submit-icon');
    if (empIcon) empIcon.innerHTML = iconAddSVG;
}

setInitialIcons(); checkURLForQR();
