import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
        import { getFirestore, doc, addDoc, updateDoc, deleteDoc, onSnapshot, collection, setDoc, increment, getDoc, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
        // --- INICIO DE CONFIGURACIÓN ---
        const app = initializeApp({ apiKey: "AIzaSyDahnSPvBNTYot00JCn5CBjggAYFVGhbjE", authDomain: "panel-logistica-simple.firebaseapp.com", projectId: "panel-logistica-simple", storageBucket: "panel-logistica-simple.firebasestorage.app", messagingSenderId: "528779971851", appId: "1:528779971851:web:29ed933e7c7fd997a4e60e" });
        const auth = getAuth(app); const db = getFirestore(app);
        const colReqs = collection(db, 'requi_toolcrib', 'data', 'requisitions');
        const colEmps = collection(db, 'requi_toolcrib', 'data', 'employees');
        const colArts = collection(db, 'requi_toolcrib', 'data', 'articles');
        const colCats = collection(db, 'requi_toolcrib', 'data', 'categories');
        const colLists = collection(db, 'requi_toolcrib', 'data', 'lists');
        
        // --- VARIABLES GLOBALES ---
        let currentUser = null, currentReqId = null, confirmAction = null, reqsData = [], empsMap = new Map(), artsMap = new Map();
        let catsMap = new Map(), listsMap = new Map();
        let currentCategory = 'Todos', currentRegCategory = 'Todos', catalogoViewMode = 'grid';
        let currentListFilterId = 'Todos', currentRegListId = 'Todos';
        let articulosSeleccionados = []; let currentItemForDetails = null;
        const PLACEHOLDER_IMG = "https://placehold.co/400x400/f1f5f9/94a3b8?text=Sin+Imagen";
        let editingEmpId = null, editingArtId = null; 
        const iconAddSVG = '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" /></svg>';
        const iconEditSVG = '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>';

        // --- FUNCIONES UTILITARIAS (Modales, Toasts) ---
        const showToast = (msg, type = 'success') => {
            const t = document.createElement('div'); t.className = `toast toast-${type}`;
            t.innerHTML = `<div class="${type==='success'?'text-green-500':type==='error'?'text-red-500':'text-blue-500'} mr-3"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg></div><div class="text-sm font-medium">${msg}</div>`;
            document.getElementById('toast-container').appendChild(t);
            setTimeout(() => { t.classList.add('hiding'); setTimeout(() => t.remove(), 300) }, 3000);
        };
        const openModal = (id) => { const m = document.getElementById(id); m.classList.remove('hidden'); setTimeout(() => { m.querySelector('.modal-content').classList.remove('scale-95','opacity-0'); }, 10); };
        window.closeModal = (id) => { const m = document.getElementById(id); m.querySelector('.modal-content').classList.add('scale-95','opacity-0'); setTimeout(() => m.classList.add('hidden'), 200); };
        const askConfirm = (title, msg, action) => { document.getElementById('confirm-title').innerText = title; document.getElementById('confirm-message').innerText = msg; confirmAction = action; openModal('confirm-modal'); };
        
        // --- FUNCIONES DE ALCANCE LOCAL (para setStatus y copyToClipboard) ---
        const setStatus = async (newStatus) => {
            if (!currentReqId || !currentUser) return;
            const docIdToUpdate = currentReqId;
            try {
                const updateData = { status: newStatus };
                if (newStatus === 'Cobrada') { updateData.fechaCobro = new Date().toISOString().split('T')[0]; } else { updateData.fechaCobro = null; }
                await updateDoc(doc(colReqs, docIdToUpdate), updateData);
                showToast(`Estatus: ${newStatus}`);
                closeModal('status-modal');
                const itemIndex = reqsData.findIndex(r => r.id === docIdToUpdate);
                if (itemIndex > -1) {
                    reqsData[itemIndex].status = newStatus;
                    reqsData[itemIndex].fechaCobro = updateData.fechaCobro || null;
                }
                const modal = document.getElementById('req-details-modal');
                if (!modal.classList.contains('hidden')) {
                    const reqId = reqsData[itemIndex].numRequi;
                    refreshReqDetailsModal(reqId);
                }
                renderReqs();
            } catch (e) { console.error(e); showToast('Error al actualizar', 'error'); }
        };
        const copyToClipboard = (text) => {
            navigator.clipboard.writeText(text).then(() => { showToast('Copiado: ' + text, 'info'); })
            .catch(err => {
                console.error('Error al copiar: ', err);
                const textArea = document.createElement("textarea"); textArea.value = text;
                document.body.appendChild(textArea); textArea.select();
                try { document.execCommand('copy'); showToast('Copiado: ' + text, 'info'); } catch (err) { showToast('No se pudo copiar', 'error'); }
                document.body.removeChild(textArea);
            });
        };
        
        // --- NAVEGACIÓN ---
        const navigateTo = (screenId) => {
            document.querySelectorAll('.screen-content').forEach(s => s.classList.add('hidden'));
            document.getElementById(screenId).classList.remove('hidden');
            document.getElementById('main-back-btn').classList.toggle('hidden', screenId === 'home-screen');
            if (screenId === 'registrar-screen') {
                document.getElementById('form-registrar').reset();
                document.getElementById('reg-fecha').value = new Date().toISOString().split('T')[0];
                articulosSeleccionados = []; currentRegCategory = 'Todos'; currentRegListId = 'Todos';
                renderRegistrarListArticles(); renderRegistrarArticulos(); renderCestaArticulos(); renderDynamicCategoryUI(); 
            }
            if (screenId === 'catalogo-screen') { currentListFilterId = 'Todos'; renderDynamicCategoryUI(); }
        };

       // --- LÓGICA DE FIRESTORE (LISTENERS) ---
        
        // 1. Listener de Autenticación (El Portero)
        onAuthStateChanged(auth, (u) => {
            currentUser = u;
            
            // Toggle de botones en el Header
            document.getElementById('btn-login-icon').classList.toggle('hidden', !!u);
            document.getElementById('btn-logout').classList.toggle('hidden', !u);
            document.getElementById('btn-admin-home').classList.toggle('hidden', !u);

            if(u) {
                document.getElementById('user-email-display').innerText = u.email;
                
              // === NUEVO: MONITOR DE TRÁFICO COMPLETO (KPIs + LOGS) ===
                
                // 1. Escuchar KPIs Generales
                onSnapshot(doc(db, 'requi_toolcrib', 'stats'), (docSnap) => {
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        const totalEl = document.getElementById('stats-total');
                        if (totalEl) totalEl.innerText = (data.totalVisits || 0).toLocaleString();

                        const qrCount = data.sources?.qr || 0;
                        const directCount = data.sources?.direct || 0;
                        const qrEl = document.getElementById('stats-qr');
                        const dirEl = document.getElementById('stats-direct');
                        if(qrEl) qrEl.innerText = qrCount.toLocaleString();
                        if(dirEl) dirEl.innerText = directCount.toLocaleString();

                        const listEl = document.getElementById('stats-list');
                        if (listEl) {
                            const scans = data.scans || {};
                            const topScans = Object.entries(scans).sort(([,a], [,b]) => b - a);
                            listEl.innerHTML = topScans.length 
                                ? topScans.map(([cat, count], idx) => {
                                    return `<div class="flex justify-between items-center text-xs"><span class="truncate w-32 font-medium text-gray-600">${idx+1}. ${cat}</span><span class="font-bold text-primary-600">${count}</span></div>`;
                                }).join('')
                                : '<div class="text-gray-400 text-xs italic">Sin datos.</div>';
                        }
                    }
                });

                // 2. Escuchar Últimos 10 Logs (En tiempo real)
                const logsQuery = query(collection(db, 'requi_toolcrib', 'data', 'traffic_logs'), orderBy('timestamp', 'desc'), limit(10));
                onSnapshot(logsQuery, (snapshot) => {
                    const logsContainer = document.getElementById('stats-recent-logs');
                    if (logsContainer) {
                        if (snapshot.empty) {
                            logsContainer.innerHTML = '<div class="text-gray-400 italic text-center pt-4">Sin actividad reciente.</div>';
                        } else {
                            logsContainer.innerHTML = snapshot.docs.map(doc => {
                                const log = doc.data();
                                const isQR = log.tipo === 'QR';
                                const icon = isQR ? '📱' : '💻';
                                // Formato de fecha corto: 27/11 10:30am
                                const timeStr = log.timestamp ? new Date(log.timestamp.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : log.hora;
                                const dateStr = log.timestamp ? new Date(log.timestamp.seconds * 1000).toLocaleDateString([], {day: '2-digit', month:'2-digit'}) : log.fecha;

                                return `
                                <div class="flex items-start gap-2 border-b border-gray-200 last:border-0 pb-1 mb-1">
                                    <div class="text-base">${icon}</div>
                                    <div class="flex-grow">
                                        <div class="flex justify-between">
                                            <span class="font-bold text-gray-700">${log.categoria}</span>
                                            <span class="text-[10px] text-gray-400">${dateStr} ${timeStr}</span>
                                        </div>
                                        <div class="text-[10px] text-gray-500">${isQR ? 'Escaneo QR' : 'Acceso Web'}</div>
                                    </div>
                                </div>`;
                            }).join('');
                        }
                    }
                });
                // =================================================================
            } else {
                // Si cierran sesión y estaban en admin, mandarlos al home
                if(!document.getElementById('admin-screen').classList.contains('hidden')) navigateTo('home-screen');
            }
            
            // Mostrar/Ocultar columnas de acciones (basura, editar) según login
            document.querySelectorAll('.col-acciones').forEach(e => e.classList.toggle('hidden', !u));
            
            // Re-renderizar todo para aplicar permisos visuales
            renderReqs(); renderAdmin(); renderCatalogo();
        });

        // 2. Listeners de Datos (Siempre activos para mantener la app viva)
        onSnapshot(colReqs, (s) => { 
            reqsData = []; 
            s.forEach(d => reqsData.push({id: d.id, ...d.data()})); 
            renderReqs(); 
        }, (e) => { 
            if(e.code==='permission-denied') document.getElementById('tbody-requisiciones').innerHTML='<tr><td colspan="7" class="p-8 text-center text-gray-500">Inicia sesión para ver datos.</td></tr>'; 
        });

        onSnapshot(colEmps, (s) => { 
            empsMap.clear(); 
            s.forEach(d => empsMap.set(d.data().id, {...d.data(), fbId: d.id})); 
            renderAdmin(); 
        });

        onSnapshot(colArts, (s) => { 
            artsMap.clear(); 
            s.forEach(d => artsMap.set(d.data().num, {...d.data(), fbId: d.id})); 
            renderAdmin(); renderCatalogo(); renderRegistrarArticulos(); renderRegistrarListArticles(); 
        });

        onSnapshot(colCats, (s) => { 
            catsMap.clear(); 
            s.forEach(d => catsMap.set(d.data().name, { ...d.data(), fbId: d.id })); 
            renderDynamicCategoryUI(); 
        }, (e) => console.error("Error al cargar categorías", e));

        onSnapshot(colLists, (s) => { 
            listsMap.clear(); 
            s.forEach(d => listsMap.set(d.id, { name: d.data().name, fbId: d.id })); 
            renderDynamicCategoryUI(); renderAdminLists(); renderRegistrarListDropdown(); 
        }, (e) => console.error("Error al cargar listas", e));
        // --- LÓGICA DE RENDERIZADO ---
        // --- RENDERIZADO DEL HISTORIAL (TABLA TUNEADA) ---
        function renderReqs() {
            const term = document.getElementById('search-input').value.toLowerCase();
            const filtered = reqsData.filter(r => (r.nombre||'').toLowerCase().includes(term) || (r.empleadoId||'').toString().includes(term) || (r.articulo||'').toLowerCase().includes(term) || (r.numRequi||'').toLowerCase().includes(term));
            
            const reqGroups = new Map();
            for (const r of filtered) {
                if (!r.numRequi) continue; 
                if (!reqGroups.has(r.numRequi)) { reqGroups.set(r.numRequi, { numRequi: r.numRequi, fecha: r.fecha, empleadoId: r.empleadoId, nombre: r.nombre, items: [], statuses: new Set() }); }
                const group = reqGroups.get(r.numRequi);
                group.items.push(r); group.statuses.add(r.status);
            }
            
            const tbody = document.getElementById('tbody-requisiciones');
            
            if (reqGroups.size === 0) { 
                tbody.innerHTML = `<tr><td colspan="7" class="p-12 text-center text-gray-400 italic">
                    <div class="flex flex-col items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        Sin resultados en el historial.
                    </div>
                </td></tr>`; 
                return; 
            }

            tbody.innerHTML = Array.from(reqGroups.values()).sort((a,b) => b.fecha.localeCompare(a.fecha)).map(group => {
                let statusHtml = '';
                
                // Diseño de Badges de Estatus (Más modernos)
                const getStatusBadge = (status, itemId) => {
                    const colors = {
                        'Autorizada': 'bg-green-100 text-green-700 border-green-200',
                        'Cobrada': 'bg-blue-100 text-blue-700 border-blue-200',
                        'Pendiente': 'bg-yellow-50 text-yellow-700 border-yellow-200'
                    };
                    const css = colors[status] || 'bg-gray-100 text-gray-600 border-gray-200';
                    // Interactividad solo si hay usuario logueado
                    const interactive = currentUser ? 'cursor-pointer hover:shadow-sm hover:scale-105 active:scale-95' : '';
                    
                    return `<span class="status-badge-modal ${interactive} transition-all inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${css}" data-doc-id="${itemId}">
                                <span class="w-1.5 h-1.5 rounded-full bg-current mr-1.5 opacity-50"></span>
                                ${status}
                            </span>`;
                };

                if (group.items.length === 1) {
                    const item = group.items[0];
                    statusHtml = getStatusBadge(item.status, item.id);
                } else if (group.statuses.size === 1) {
                    const status = group.statuses.values().next().value;
                    statusHtml = getStatusBadge(status, null); // Sin ID específico porque son varios
                } else {
                    statusHtml = `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-600 border border-gray-200">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor"><path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" /></svg>
                                    Mixto
                                  </span>`;
                }

                // Diseño de Artículo (Texto o Botón Ver Detalles)
                const articuloHtml = group.items.length > 1 
                    ? `<button class="btn-view-req-details inline-flex items-center gap-1.5 bg-white border border-gray-300 text-gray-700 hover:text-primary-600 hover:border-primary-300 px-3 py-1.5 rounded-lg text-sm font-medium transition shadow-sm" data-req-id="${group.numRequi}">
                         <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                         Ver ${group.items.length} Artículos
                       </button>` 
                    : `<span class="font-medium text-gray-700 text-sm">${group.items[0]?.articulo || 'N/A'}</span>`;

                const cobroFecha = group.items.length === 1 ? (group.items[0].fechaCobro || '-') : (group.statuses.size === 1 && group.statuses.has('Cobrada') ? 'Múltiple' : '-');

                return `
                <tr class="hover:bg-gray-50 transition border-b border-gray-100 last:border-0 group">
                    <td data-label="# Requi" class="px-6 py-4">
                        <span class="font-mono text-sm font-bold text-primary-700 bg-primary-50 px-2 py-1 rounded border border-primary-100">
                            ${group.numRequi}
                        </span>
                    </td>
                    
                    <td data-label="Fecha" class="px-6 py-4 text-sm text-gray-500 font-medium">
                        ${group.fecha}
                    </td>
                    
                    <td data-label="Empleado" class="px-6 py-4">
                        <div class="flex items-center">
                            <div class="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-xs font-bold mr-3 border border-gray-200">
                                ${group.nombre.charAt(0)}
                            </div>
                            <div>
                                <div class="font-bold text-gray-800 text-sm">${group.nombre}</div>
                                <div class="text-xs text-gray-400 font-mono">${group.empleadoId}</div>
                            </div>
                        </div>
                    </td>
                    
                    <td data-label="Artículo" class="px-6 py-4">
                        ${articuloHtml}
                    </td>
                    
                    <td data-label="Estatus" class="px-6 py-4 text-center">
                        ${statusHtml}
                    </td>
                    
                    <td data-label="Cobro" class="px-6 py-4 text-sm text-gray-500">
                        ${cobroFecha}
                    </td>
                    
                    <td class="px-6 py-4 text-center col-acciones ${currentUser?'':'hidden'}">
                        <button class="btn-del-req text-gray-300 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition" 
                            data-req-id="${group.numRequi}" data-items-count="${group.items.length}" title="Eliminar requisición completa">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                        </button>
                    </td>
                </tr>`;
            }).join('');
        }
        
        function refreshReqDetailsModal(reqId) {
            const groupItems = reqsData.filter(r => r.numRequi === reqId);
            if (groupItems.length > 0) {
                document.getElementById('req-details-list').innerHTML = groupItems.map(item => {
                    const statusClass = item.status==='Autorizada'?'bg-green-100 text-green-800':item.status==='Cobrada'?'bg-blue-100 text-blue-800':'bg-yellow-100 text-yellow-800';
                    return `<div class="flex justify-between items-center p-3"><span class="text-sm font-medium text-gray-700">${item.articulo}</span><span class="status-badge-modal ${currentUser ? 'cursor-pointer hover:scale-105' : ''} transition inline-flex px-3 py-1 text-xs font-semibold rounded-full ${statusClass}" data-doc-id="${item.id}">${item.status}</span></div>`;
                }).join('');
            }
        }
        function renderAdmin() {
    // 1. Render Empleados (Igual que antes)
    document.getElementById('admin-list-empleados').innerHTML = empsMap.size ? Array.from(empsMap.values()).sort((a, b) => a.id - b.id).map(e => `<div class="flex justify-between items-center p-3 hover:bg-white transition"><div><span class="font-bold">${e.id}</span> <span class="text-gray-600 ml-2">${e.nombre}</span></div><div class="flex gap-3"><button class="btn-edit-emp text-gray-400 hover:text-blue-600 transition" data-id="${e.fbId}" data-emp-id="${e.id}" data-n="${e.nombre}" title="Editar"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 pointer-events-none"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" /></svg></button><button class="btn-del-emp text-gray-400 hover:text-red-600 transition" data-id="${e.fbId}" data-n="${e.nombre}" title="Eliminar"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pointer-events-none" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg></button></div></div>`).join('') : '<div class="p-4 text-center text-gray-400 italic">Vacío</div>';

    // 2. Render Artículos (CORREGIDO: Agrupación Flexible + PRECIO)
    const listContainer = document.getElementById('admin-list-articulos');
    const term = document.getElementById('admin-art-search').value.toLowerCase();

    // Obtener todos los artículos y filtrarlos
    let articles = Array.from(artsMap.values());
    if (term) {
        articles = articles.filter(a => a.num.toLowerCase().includes(term) || a.nom.toLowerCase().includes(term));
    }

    if (articles.length === 0) {
        listContainer.innerHTML = '<div class="p-8 text-center text-gray-400 italic">No se encontraron artículos.</div>';
        return;
    }

    // Agrupar por categoría (LÓGICA NUEVA)
    const grouped = {};

    // Primero aseguramos que existan grupos para las categorías oficiales (para mantener orden)
    const officialCats = Array.from(catsMap.keys()).sort();
    officialCats.forEach(cat => grouped[cat] = []);

    // Repartir artículos
    articles.forEach(a => {
        // AQUÍ EL CAMBIO: Usamos la categoría del artículo tal cual. 
        // Si está vacío, va a 'Sin Categoría'.
        const catKey = a.cat || 'Sin Categoría';

        if (!grouped[catKey]) grouped[catKey] = []; // Si es una categoría "huérfana", creamos el grupo
        grouped[catKey].push(a);
    });

    // Generar HTML recorriendo TODOS los grupos creados
    let html = '';
    // Obtenemos todas las claves de grupos que tienen algo o son oficiales, ordenadas alfabéticamente
    const allGroupKeys = Object.keys(grouped).sort();

    allGroupKeys.forEach(catName => {
        const items = grouped[catName];
        // Solo mostramos si tiene items
        if (items && items.length > 0) {
            items.sort((a, b) => a.nom.localeCompare(b.nom));

            // Header de la Categoría
            html += `<div class="sticky top-0 bg-gray-100 px-4 py-2 font-bold text-gray-700 text-sm border-y border-gray-200 z-10 flex justify-between items-center shadow-sm">
                                <span>${catName}</span>
                                <span class="bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full text-xs font-bold">${items.length}</span>
                             </div>`;

            // Lista de items
            html += items.map(a => {
                const listNames = (a.assignedLists || []).map(listId => listsMap.get(listId)?.name).filter(Boolean).join(', ');
                
                // Formateamos el precio. Si no existe, es 0.
                const precioDisplay = (Number(a.precio) || 0).toFixed(2);

                return `
                        <div class="flex justify-between items-center p-3 hover:bg-primary-50 transition border-b border-gray-50 last:border-0 group bg-white">
                            <div class="flex-grow">
                                <div class="flex items-center gap-2">
                                    <span class="font-mono text-xs sm:text-sm bg-white border border-gray-200 text-primary-700 px-2 py-0.5 rounded font-bold">${a.num}</span>
                                    <span class="font-medium text-gray-800 text-sm sm:text-base">${a.nom}</span>
                                </div>
                                
                                <div class="mt-1 flex flex-wrap gap-2 items-center">
                                    <span class="text-xs font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-100">$${precioDisplay}</span>
                                    
                                    ${a.hasVariants ? `<span class="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-100">Variantes: ${a.variants}</span>` : ''}
                                    ${listNames ? `<span class="text-xs bg-yellow-50 text-yellow-600 px-2 py-0.5 rounded border border-yellow-100" title="${listNames}">En listas</span>` : ''}
                                </div>
                            </div>
                            <div class="flex gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                <button class="btn-edit-art bg-white border border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-300 p-2 rounded-lg shadow-sm transition" 
                                    data-id="${a.fbId}" title="Editar">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 pointer-events-none"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" /></svg>
                                </button>
                                <button class="btn-del-art bg-white border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-300 p-2 rounded-lg shadow-sm transition" 
                                    data-id="${a.fbId}" data-n="${a.nom}" title="Eliminar">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 pointer-events-none" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>
                                </button>
                            </div>
                        </div>`;
            }).join('');
        }
    });

    listContainer.innerHTML = html;
}
        
       function renderCatalogo() {
            const term = document.getElementById('search-catalogo').value.toLowerCase();
            let articles = Array.from(artsMap.values());
            
            // --- FILTROS ---
            if (currentListFilterId !== 'Todos') { articles = articles.filter(a => a.assignedLists && a.assignedLists.includes(currentListFilterId)); }
            if (currentCategory !== 'Todos') { articles = articles.filter(a => a.cat === currentCategory); }
            if (term) { articles = articles.filter(a => a.num.toLowerCase().includes(term) || a.nom.toLowerCase().includes(term)); }
            
            // --- ORDENAMIENTO (CAMBIO AQUÍ) ---
            // Antes: a.num.localeCompare(b.num) -> Por Número
            // Ahora: a.nom.localeCompare(b.nom) -> Alfabético por Descripción
            articles.sort((a,b) => a.nom.localeCompare(b.nom));
            
            const grid = document.getElementById('catalogo-grid'); 
            grid.className = ''; 
            
            // Si no hay resultados
            if (articles.length === 0) { 
                grid.innerHTML = `
                    <div class="col-span-full flex flex-col items-center justify-center p-12 text-center">
                        <div class="bg-gray-100 rounded-full p-4 mb-3">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8 text-gray-400"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                        </div>
                        <p class="text-gray-500 font-medium">No encontramos artículos con esa búsqueda.</p>
                    </div>`; 
                return; 
            }

            // --- VISTA DE GALERÍA (GRID) ---
            if (catalogoViewMode === 'grid') {
                grid.className = 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6';
                grid.innerHTML = articles.map(a => {
                    
                    let imgSrc = a.img || PLACEHOLDER_IMG;
                    if (a.img && !a.img.startsWith('http') && !a.img.startsWith('https')) {
                        imgSrc = `./catalogo/${a.img}`;
                    }

                    return `
                    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group flex flex-col h-full relative">
                        
                        <div class="aspect-w-1 bg-white relative overflow-hidden border-b border-gray-50">
                            <img src="${imgSrc}" alt="${a.nom}" 
                                 class="object-contain w-full h-full p-6 transition-transform duration-500 group-hover:scale-110" 
                                 onerror="this.src='${PLACEHOLDER_IMG}'">
                        </div>

                        <div class="p-5 flex flex-col flex-grow">
                            
                            <div class="mb-2 text-left">
                                <span class="text-[10px] font-extrabold uppercase tracking-widest text-gray-400">
                                    ${a.cat || 'GENERAL'}
                                </span>
                            </div>

                            <div class="mb-3">
                                <button class="btn-copy-part group/btn w-full flex items-center justify-center gap-2 font-mono text-base font-black text-slate-700 bg-slate-100 hover:bg-slate-200 hover:text-primary-800 hover:border-primary-300 px-3 py-2 rounded-xl border border-slate-200 transition-all active:scale-95" 
                                        data-num="${a.num}" title="Clic para copiar">
                                    <span class="tracking-tight">${a.num}</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 opacity-0 group-hover/btn:opacity-100 transition-opacity text-primary-600 translate-y-[1px]"><path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" /><path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a3 3 0 00-.879-2.121l-3.12-3.122A3 3 0 006.879 6H4.5z" /></svg>
                                </button>
                            </div>

                            <h3 class="text-sm font-medium text-gray-600 leading-relaxed flex-grow text-center">
                                ${a.nom}
                            </h3>

                            ${a.hasVariants ? `
                            <div class="mt-4 pt-3 border-t border-dashed border-gray-100 flex items-center justify-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-blue-400"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13.5a.75.75 0 00-1.5 0v5H6.75a.75.75 0 000 1.5h3.25a.75.75 0 00.75-.75v-5.75z" clip-rule="evenodd" /></svg>
                                <span class="text-xs font-semibold text-blue-600">Opciones: ${a.variants}</span>
                            </div>` : ''}
                        </div>
                    </div>`;
                }).join('');
            
            } else {
                // --- VISTA DE LISTA (LIST) ---
                grid.className = 'flex flex-col gap-3';
                grid.innerHTML = articles.map(a => {
                    return `
                    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col sm:flex-row sm:items-center gap-4 hover:border-primary-200 transition-colors group">
                        
                        <div class="flex-grow">
                            <div class="flex items-center gap-2 mb-1">
                                <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider border border-gray-200 px-1.5 py-0.5 rounded">${a.cat || 'GENERAL'}</span>
                                ${a.hasVariants ? `<span class="text-[10px] font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">VARIOS</span>` : ''}
                            </div>
                            <div class="text-gray-800 font-medium leading-snug">${a.nom}</div>
                        </div>
                        
                        <div class="mt-2 sm:mt-0 min-w-[180px]">
                             <button class="btn-copy-part group/btn w-full flex items-center justify-center gap-2 font-mono text-sm font-black text-slate-700 bg-slate-50 hover:bg-slate-100 hover:text-primary-800 hover:border-primary-300 px-3 py-2 rounded-lg border border-slate-200 transition-all active:scale-95" 
                                        data-num="${a.num}" title="Clic para copiar">
                                    <span class="tracking-tight">${a.num}</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 opacity-0 group-hover/btn:opacity-100 transition-opacity text-primary-600 translate-y-[1px]"><path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" /><path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a3 3 0 00-.879-2.121l-3.12-3.122A3 3 0 006.879 6H4.5z" /></svg>
                                </button>
                        </div>
                    </div>`;
                }).join('');
            }
        }
        
        function renderDynamicCategoryUI() {
            renderAdminCategorias(); renderArticuloCategoryDropdown();
            renderCatalogoFiltros('catalogo-filtros', currentCategory, 'btn-cat-filter');
            renderCatalogoFiltros('filtros-reg-articulo', currentRegCategory, 'btn-reg-cat-filter');
            renderCatalogoListFiltros(); 
            renderCatalogo(); renderRegistrarArticulos(); renderRegistrarListArticles();
        }
        // Reemplaza tu función renderAdminCategorias con esta:
function renderAdminCategorias() {
    const list = document.getElementById('admin-list-categorias');
    const sortedCats = Array.from(catsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    
    list.innerHTML = sortedCats.length ? sortedCats.map(cat => `
        <div class="flex justify-between items-center p-3 hover:bg-white transition group">
            <span class="text-gray-700 font-medium">${cat.name}</span>
            <div class="flex gap-2">
                <button class="btn-qr-cat text-gray-400 hover:text-gray-900 bg-gray-50 hover:bg-gray-200 p-1.5 rounded-lg transition" 
                        data-n="${cat.name}" title="Generar QR para etiquetas">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z" />
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75ZM6.75 16.5h.75v.75h-.75v-.75ZM16.5 6.75h.75v.75h-.75v-.75ZM13.5 13.5h.75v.75h-.75v-.75ZM13.5 19.5h.75v.75h-.75v-.75ZM19.5 13.5h.75v.75h-.75v-.75ZM19.5 19.5h.75v.75h-.75v-.75ZM16.5 16.5h.75v.75h-.75v-.75Z" />
                    </svg>
                </button>
                <button class="btn-del-cat text-gray-400 hover:text-red-600 p-1.5 transition" 
                        data-id="${cat.fbId}" data-n="${cat.name}" title="Eliminar Categoría">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
                    </svg>
                </button>
            </div>
        </div>`).join('') : '<div class="p-4 text-center text-gray-400 italic">Vacío</div>';
}
        function renderArticuloCategoryDropdown() {
            const select = document.getElementById('admin-art-cat');
            const currentValue = select.value; const sortedCats = Array.from(catsMap.keys()).sort();
            select.innerHTML = '<option value="">Seleccione Categoría...</option>'; 
            sortedCats.forEach(catName => { select.innerHTML += `<option value="${catName}">${catName}</option>`; });
            select.value = currentValue; 
        }
        function renderCatalogoFiltros(containerId, activeCategory, btnClass) {
            const container = document.getElementById(containerId); if (!container) return;
            const sortedCats = Array.from(catsMap.keys()).sort();
            let html = `<button data-category="Todos" class="${btnClass} px-3 py-1 text-sm font-medium rounded-full transition border">Todos</button>`;
            sortedCats.forEach(catName => { html += `<button data-category="${catName}" class="${btnClass} px-3 py-1 text-sm font-medium rounded-full transition border">${catName}</button>`; });
            container.innerHTML = html;
            container.querySelectorAll(`.${btnClass}`).forEach(btn => {
                if (btn.dataset.category === activeCategory) { btn.classList.add('bg-primary-600', 'text-white', 'border-primary-600'); btn.classList.remove('bg-white', 'text-gray-600', 'hover:bg-gray-50', 'border-gray-300'); } 
                else { btn.classList.add('bg-white', 'text-gray-600', 'hover:bg-gray-50', 'border-gray-300'); btn.classList.remove('bg-primary-600', 'text-white', 'border-primary-600'); }
            });
        }
        function renderAdminLists() {
            const list = document.getElementById('admin-list-lists');
            const sortedLists = Array.from(listsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
            list.innerHTML = sortedLists.length ? sortedLists.map(l => `<div class="flex justify-between items-center p-3 hover:bg-white transition"><span class="text-gray-700">${l.name}</span><button class="btn-del-list text-gray-400 hover:text-red-600 transition" data-id="${l.fbId}" data-n="${l.name}" title="Eliminar Lista"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pointer-events-none" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg></button></div>`).join('') : '<div class="p-4 text-center text-gray-400 italic">Vacío</div>';
        }
        function renderArticuloListsCheckboxes(assignedLists = []) {
            const container = document.getElementById('admin-art-lists');
            const sortedLists = Array.from(listsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
            container.innerHTML = sortedLists.length ? sortedLists.map(l => `<div class="flex items-center"><input id="list-${l.fbId}" value="${l.fbId}" type="checkbox" ${assignedLists.includes(l.fbId) ? 'checked' : ''} class="h-4 w-4 rounded text-primary-600 focus:ring-primary-500"><label for="list-${l.fbId}" class="ml-2 text-sm text-gray-700">${l.name}</label></div>`).join('') : '<div class="text-sm text-gray-400 italic">No hay listas creadas.</div>';
        }
        function renderCatalogoListFiltros() {
            const container = document.getElementById('catalogo-list-filtros'); if (!container) return;
            const sortedLists = Array.from(listsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
            let html = `<button data-list-id="Todos" class="btn-list-filter px-3 py-1 text-sm font-medium rounded-full transition border">Todas</button>`;
            sortedLists.forEach(l => { html += `<button data-list-id="${l.fbId}" class="btn-list-filter px-3 py-1 text-sm font-medium rounded-full transition border">${l.name}</button>`; });
            container.innerHTML = html;
            container.querySelectorAll('.btn-list-filter').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.listId === currentListFilterId);
            });
        }
        function renderRegistrarListDropdown() {
            const select = document.getElementById('reg-list-select'); if (!select) return;
            const sortedLists = Array.from(listsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
            select.innerHTML = '<option value="Todos">Mostrar Todas las Listas</option>';
            sortedLists.forEach(l => { select.innerHTML += `<option value="${l.fbId}">${l.name}</option>`; });
            select.value = currentRegListId;
        }

        // --- RENDERIZADO PANTALLA REGISTRO ---
        function renderRegistrarListArticles() {
            const list = document.getElementById('lista-diarios'); if (!list) return; 
            
            let articles = Array.from(artsMap.values());
            
            // Filtro de lista seleccionada
            if (currentRegListId === 'Todos') { articles = articles.filter(a => a.assignedLists && a.assignedLists.length > 0); } 
            else { articles = articles.filter(a => a.assignedLists && a.assignedLists.includes(currentRegListId)); }
            
            // Orden Alfabético
            articles.sort((a,b) => a.nom.localeCompare(b.nom));
            
            if (articles.length === 0) { 
                list.innerHTML = `<div class="p-8 text-center text-gray-400 italic flex flex-col items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                    ${currentRegListId === 'Todos' ? 'No hay artículos en listas.' : 'Lista vacía.'}
                </div>`; 
                return; 
            }

            list.innerHTML = articles.map(a => {
                const isAdded = !a.hasVariants && articulosSeleccionados.some(art => art.num === a.num);
                
                // Lógica de Imagen
                let imgSrc = a.img || PLACEHOLDER_IMG;
                if (a.img && !a.img.startsWith('http') && !a.img.startsWith('https')) { imgSrc = `./catalogo/${a.img}`; }

                return `
                <div class="flex items-center p-3 hover:bg-white transition border-b border-gray-100 last:border-0 group">
                    <div class="h-12 w-12 flex-shrink-0 bg-gray-50 rounded-lg border border-gray-100 overflow-hidden mr-3">
                        <img src="${imgSrc}" alt="${a.nom}" class="h-full w-full object-contain p-1" onerror="this.src='${PLACEHOLDER_IMG}'">
                    </div>
                    
                    <div class="flex-grow min-w-0 mr-2">
                        <div class="font-bold text-gray-800 text-sm truncate" title="${a.nom}">${a.nom}</div>
                        <div class="flex items-center gap-2 mt-0.5">
                            <span class="font-mono text-xs font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">${a.num}</span>
                            ${a.hasVariants ? '<span class="text-[10px] font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">Tallas</span>' : ''}
                        </div>
                    </div>

                    <button class="btn-add-articulo flex-shrink-0 h-9 w-9 flex items-center justify-center rounded-lg transition-all shadow-sm ${isAdded ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white border border-gray-200 text-primary-600 hover:bg-primary-50 hover:border-primary-200 hover:scale-105'}" 
                        data-num="${a.num}" data-nom="${a.nom}" data-has-variants="${a.hasVariants || false}" data-variants="${a.variants || ''}" ${isAdded ? 'disabled' : ''} title="${isAdded ? 'Ya agregado' : 'Agregar a la cesta'}">
                        ${isAdded 
                            ? '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>' 
                            : '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" /></svg>'}
                    </button>
                </div>`;
            }).join('');
        }
        
        function renderRegistrarArticulos() {
            const list = document.getElementById('lista-reg-articulo'); if (!list) return; 
            const term = document.getElementById('search-reg-articulo').value.toLowerCase();
            
            let articles = Array.from(artsMap.values());
            
            // Filtros
            if (currentRegCategory !== 'Todos') articles = articles.filter(a => a.cat === currentRegCategory);
            if (term) articles = articles.filter(a => a.num.toLowerCase().includes(term) || a.nom.toLowerCase().includes(term));
            
            // Orden Alfabético
            articles.sort((a,b) => a.nom.localeCompare(b.nom));
            
            if (articles.length === 0) { 
                list.innerHTML = `<div class="p-8 text-center text-gray-400 italic flex flex-col items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    No se encontraron artículos.
                </div>`; 
                return; 
            }

            list.innerHTML = articles.map(a => {
                const isAdded = !a.hasVariants && articulosSeleccionados.some(art => art.num === a.num);
                
                // Lógica de Imagen
                let imgSrc = a.img || PLACEHOLDER_IMG;
                if (a.img && !a.img.startsWith('http') && !a.img.startsWith('https')) { imgSrc = `./catalogo/${a.img}`; }

                return `
                <div class="flex items-center p-3 hover:bg-white transition border-b border-gray-100 last:border-0 group">
                    <div class="h-12 w-12 flex-shrink-0 bg-gray-50 rounded-lg border border-gray-100 overflow-hidden mr-3">
                        <img src="${imgSrc}" alt="${a.nom}" class="h-full w-full object-contain p-1" onerror="this.src='${PLACEHOLDER_IMG}'">
                    </div>

                    <div class="flex-grow min-w-0 mr-2">
                        <div class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">${a.cat || 'General'}</div>
                        <div class="font-bold text-gray-800 text-sm truncate" title="${a.nom}">${a.nom}</div>
                        <div class="flex items-center gap-2 mt-1">
                            <span class="font-mono text-xs font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">${a.num}</span>
                            ${a.hasVariants ? '<span class="text-[10px] font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">Tallas</span>' : ''}
                        </div>
                    </div>

                    <button class="btn-add-articulo flex-shrink-0 h-9 w-9 flex items-center justify-center rounded-lg transition-all shadow-sm ${isAdded ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white border border-gray-200 text-primary-600 hover:bg-primary-50 hover:border-primary-200 hover:scale-105'}" 
                        data-num="${a.num}" data-nom="${a.nom}" data-has-variants="${a.hasVariants || false}" data-variants="${a.variants || ''}" ${isAdded ? 'disabled' : ''} title="${isAdded ? 'Ya agregado' : 'Agregar a la cesta'}">
                        ${isAdded 
                            ? '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>' 
                            : '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" /></svg>'}
                    </button>
                </div>`;
            }).join('');
        }
        
        function renderCestaArticulos() {
            const cesta = document.getElementById('cesta-articulos'), placeholder = document.getElementById('cesta-placeholder'), conteo = document.getElementById('cesta-conteo');
            if (!cesta || !placeholder || !conteo) return; 
            
            conteo.innerText = articulosSeleccionados.length;
            
            if (articulosSeleccionados.length === 0) { 
                cesta.innerHTML = ''; cesta.classList.add('hidden'); placeholder.classList.remove('hidden'); 
            } else {
                cesta.classList.remove('hidden'); placeholder.classList.add('hidden'); 
                
                cesta.innerHTML = articulosSeleccionados.map((art, index) => {
                    // Lógica de Imagen (Para mostrarla en la cesta también)
                    let imgSrc = art.img || PLACEHOLDER_IMG;
                    if (art.img && !art.img.startsWith('http') && !art.img.startsWith('https')) { imgSrc = `./catalogo/${art.img}`; }

                    return `
                    <div class="flex justify-between items-center p-3 animate-fade-in hover:bg-gray-50 transition rounded-lg">
                        <div class="flex items-center overflow-hidden">
                            <div class="h-10 w-10 flex-shrink-0 bg-white rounded border border-gray-200 overflow-hidden mr-3">
                                <img src="${imgSrc}" alt="${art.nom}" class="h-full w-full object-contain p-0.5" onerror="this.src='${PLACEHOLDER_IMG}'">
                            </div>
                            
                            <div class="min-w-0">
                                <div class="font-bold text-gray-800 text-sm truncate pr-2 leading-tight">${art.nom}</div>
                                <div class="flex items-center gap-2 text-xs mt-0.5">
                                    <span class="font-mono font-medium text-gray-500">${art.num}</span>
                                    ${art.variant ? `<span class="bg-blue-100 text-blue-700 px-1.5 rounded font-bold">${art.variant}</span>` : ''}
                                    <span class="bg-green-100 text-green-700 px-1.5 rounded font-bold">x${art.qty}</span>
                                </div>
                            </div>
                        </div>
                        
                        <button class="btn-remove-articulo h-8 w-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition ml-2 flex-shrink-0" 
                            data-index="${index}" title="Quitar de la cesta">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clip-rule="evenodd" /></svg>
                        </button>
                    </div>`;
                }).join('');
            }
            // Importante: Volver a renderizar las listas para actualizar los botones de "Agregado"
            renderRegistrarArticulos(); 
            renderRegistrarListArticles(); 
        }
        // --- LÓGICA DE CLICS (Event Delegation) ---
        document.addEventListener('click', e => {
            const navBtn = e.target.closest('[data-navigate-to]'); if (navBtn) navigateTo(navBtn.dataset.navigateTo);
            if(e.target.closest('[data-dismiss="modal"]')) closeModal(e.target.closest('.modal').id);
            const copyBtn = e.target.closest('.btn-copy-part'); if (copyBtn) { copyToClipboard(copyBtn.dataset.num); }
            const delEmp = e.target.closest('.btn-del-emp'); if(delEmp && currentUser) askConfirm('Eliminar Empleado', `¿Eliminar a ${delEmp.dataset.n}?`, async () => { await deleteDoc(doc(colEmps, delEmp.dataset.id)); showToast('Eliminado'); });
            const delArt = e.target.closest('.btn-del-art'); if(delArt && currentUser) askConfirm('Eliminar Artículo', `¿Eliminar ${delArt.dataset.n}?`, async () => { await deleteDoc(doc(colArts, delArt.dataset.id)); showToast('Eliminado'); });
            const delCat = e.target.closest('.btn-del-cat'); if(delCat && currentUser) askConfirm('Eliminar Categoría', `¿Eliminar "${delCat.dataset.n}"? Esto no eliminará los artículos que ya la usan.`, async () => { await deleteDoc(doc(colCats, delCat.dataset.id)); showToast('Categoría eliminada'); });
            const delList = e.target.closest('.btn-del-list'); if(delList && currentUser) askConfirm('Eliminar Lista', `¿Eliminar "${delList.dataset.n}"? Esto no eliminará los artículos.`, async () => { await deleteDoc(doc(colLists, delList.dataset.id)); showToast('Lista eliminada'); });
            
            const viewReq = e.target.closest('.btn-view-req-details');
            if (viewReq) {
                const reqId = viewReq.dataset.reqId; const groupItems = reqsData.filter(r => r.numRequi === reqId);
                if (groupItems.length > 0) {
                    const base = groupItems[0];
                    document.getElementById('req-details-title').innerText = `Detalles: ${base.numRequi}`;
                    document.getElementById('req-details-num').innerText = base.numRequi;
                    document.getElementById('req-details-fecha').innerText = base.fecha;
                    document.getElementById('req-details-emp').innerText = `${base.empleadoId} - ${base.nombre}`;
                    refreshReqDetailsModal(reqId); openModal('req-details-modal');
                }
            }
            // CORRECCIÓN 1: El listener ahora también escucha '.status-badge-modal'
            const statusBadge = e.target.closest('.status-badge-modal');
            if (statusBadge && currentUser) { currentReqId = statusBadge.dataset.docId; openModal('status-modal'); }

            const delReq = e.target.closest('.btn-del-req'); 
            if(delReq && currentUser) {
                const reqId = delReq.dataset.reqId, count = delReq.dataset.itemsCount;
                askConfirm(`Eliminar Requisición ${reqId}`, `¿Seguro que quieres eliminar esta requisición con ${count} artículo(s)? Esta acción es permanente.`, async () => { 
                    const itemsToDelete = reqsData.filter(r => r.numRequi === reqId);
                    const deletePromises = itemsToDelete.map(item => deleteDoc(doc(colReqs, item.id)));
                    await Promise.all(deletePromises); showToast('Requisición eliminada'); 
                });
            }
            
            const catBtn = e.target.closest('.btn-cat-filter'); if (catBtn) { currentCategory = catBtn.dataset.category; renderCatalogoFiltros('catalogo-filtros', currentCategory, 'btn-cat-filter'); renderCatalogo(); }
            const regCatBtn = e.target.closest('.btn-reg-cat-filter'); if (regCatBtn) { currentRegCategory = regCatBtn.dataset.category; renderCatalogoFiltros('filtros-reg-articulo', currentRegCategory, 'btn-reg-cat-filter'); renderRegistrarArticulos(); }
            const listFilterBtn = e.target.closest('.btn-list-filter'); if (listFilterBtn) { currentListFilterId = listFilterBtn.dataset.listId; renderCatalogoListFiltros(); renderCatalogo(); }
            
            const editEmp = e.target.closest('.btn-edit-emp'); if (editEmp) startEditEmpleado(editEmp.dataset);
            const editArt = e.target.closest('.btn-edit-art'); if (editArt) { const artData = Array.from(artsMap.values()).find(a => a.fbId === editArt.dataset.id); if (artData) startEditArticulo(artData); }
            const viewGrid = e.target.closest('#btn-view-grid'); if (viewGrid) { catalogoViewMode = 'grid'; document.getElementById('btn-view-grid').classList.add('active'); document.getElementById('btn-view-list').classList.remove('active'); renderCatalogo(); }
            const viewList = e.target.closest('#btn-view-list'); if (viewList) { catalogoViewMode = 'list'; document.getElementById('btn-view-list').classList.add('active'); document.getElementById('btn-view-grid').classList.remove('active'); renderCatalogo(); }

            const addArt = e.target.closest('.btn-add-articulo');
            if (addArt) {
                const { num, nom, hasVariants, variants } = addArt.dataset;
                currentItemForDetails = { num, nom }; const title = document.getElementById('item-details-title'), variantContainer = document.getElementById('variant-container'), variantSelect = document.getElementById('variant-select');
                document.getElementById('item-qty').value = "1";
                if (hasVariants === 'true' && variants) {
                    title.innerText = `Detalles de: ${nom}`; variantContainer.style.display = 'block';
                    variantSelect.innerHTML = '<option value="">Seleccione Talla...</option>';
                    variants.split(',').forEach(v => { const variant = v.trim(); if (variant) { variantSelect.innerHTML += `<option value="${variant}">${variant}</option>`; } });
                } else { title.innerText = `Confirmar Cantidad: ${nom}`; variantContainer.style.display = 'none'; variantSelect.innerHTML = ''; }
                openModal('item-details-modal');
            }
            const removeArt = e.target.closest('.btn-remove-articulo'); if (removeArt) { const indexToRemove = parseInt(removeArt.dataset.index, 10); if (!isNaN(indexToRemove)) { articulosSeleccionados.splice(indexToRemove, 1); renderCestaArticulos(); } }
            const qtyPlus = e.target.closest('#btn-qty-plus'); if (qtyPlus) { const input = document.getElementById('item-qty'); input.value = parseInt(input.value, 10) + 1; }
            const qtyMinus = e.target.closest('#btn-qty-minus'); if (qtyMinus) { const input = document.getElementById('item-qty'); const newVal = parseInt(input.value, 10) - 1; if (newVal >= 1) { input.value = newVal; } }
        });

        // --- FUNCIONES DE CRUD (EMPLEADOS) ---
        function startEditEmpleado(data) {
            editingEmpId = data.id; document.getElementById('admin-emp-id').value = data.empId;
            document.getElementById('admin-emp-id').readOnly = true; document.getElementById('admin-emp-nombre').value = data.n;
            document.getElementById('emp-form-title').innerText = "Editar Empleado";
            document.getElementById('emp-submit-icon').innerHTML = iconEditSVG;
            document.getElementById('btn-cancel-emp').classList.remove('hidden'); document.getElementById('admin-emp-nombre').focus();
        }
        function cancelEditEmpleado() {
            editingEmpId = null; document.getElementById('form-add-empleado').reset();
            document.getElementById('admin-emp-id').readOnly = false; document.getElementById('emp-form-title').innerText = "Empleados";
            document.getElementById('emp-submit-icon').innerHTML = iconAddSVG; document.getElementById('btn-cancel-emp').classList.add('hidden');
        }

       // --- EVENTO PARA EL BUSCADOR DE ADMIN (NUEVO) ---
        document.getElementById('admin-art-search').addEventListener('input', () => {
            renderAdmin(); // Re-renderiza al escribir para filtrar
        });

        // --- FUNCIONES DE CRUD (ARTÍCULOS) ---
       // --- FUNCIONES DE CRUD (ARTÍCULOS) ---
function startEditArticulo(art) {
    editingArtId = art.fbId; 
    
    // Llenar campos existentes
    document.getElementById('admin-art-num').value = art.num;
    document.getElementById('admin-art-original-num').value = art.num;
    document.getElementById('admin-art-num').readOnly = false; 
    document.getElementById('admin-art-nom').value = art.nom;
    document.getElementById('admin-art-cat').value = art.cat || ''; 
    
    // --- NUEVO: Cargar Precio ---
    document.getElementById('admin-art-precio').value = art.precio || ''; 
    // ----------------------------

    document.getElementById('admin-art-img').value = art.img || '';
    
    const hasVariantsCheck = document.getElementById('admin-art-hasVariants');
    const variantsContainer = document.getElementById('admin-variants-container');
    const variantsInput = document.getElementById('admin-art-variants');
    
    if (art.hasVariants) { 
        hasVariantsCheck.checked = true; 
        variantsInput.value = art.variants || ''; 
        variantsContainer.style.display = 'block'; 
    } else { 
        hasVariantsCheck.checked = false; 
        variantsInput.value = ''; 
        variantsContainer.style.display = 'none'; 
    }
    
    renderArticuloListsCheckboxes(art.assignedLists);
    
    // Cambios visuales
    const title = document.getElementById('art-form-title');
    title.innerText = "Editar Artículo";
    title.classList.add('text-primary-600'); 
    
    const submitBtn = document.querySelector('#form-add-articulo button[type="submit"]');
    submitBtn.innerHTML = `${iconEditSVG} Actualizar`;
    submitBtn.title = "Guardar Cambios";
    
    document.getElementById('btn-cancel-art').classList.remove('hidden'); 
    document.getElementById('form-add-articulo').scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('admin-art-num').focus();
}

function cancelEditArticulo() {
    editingArtId = null; 
    document.getElementById('form-add-articulo').reset();
    document.getElementById('admin-art-original-num').value = ""; 
    
    // --- NUEVO: Asegurar que el precio se limpie visualmente (aunque el reset lo hace, reforzamos) ---
    document.getElementById('admin-art-precio').value = "";
    // ------------------------------------------------------------------------------------------------

    document.getElementById('admin-art-num').readOnly = false;
    document.getElementById('admin-variants-container').style.display = 'none';
    document.getElementById('admin-art-hasVariants').checked = false;
    renderArticuloListsCheckboxes();
    
    const title = document.getElementById('art-form-title');
    title.innerText = "Catálogo Artículos";
    title.classList.remove('text-primary-600');
    
    const submitBtn = document.querySelector('#form-add-articulo button[type="submit"]');
    submitBtn.innerHTML = `${iconAddSVG}`; 
    submitBtn.title = "Guardar";
    
    document.getElementById('btn-cancel-art').classList.add('hidden');
}

        // --- LISTENERS DE EVENTOS DE FORMULARIO Y OTROS ---
        document.getElementById('main-back-btn').onclick = () => navigateTo('home-screen');
        document.getElementById('btn-login-icon').onclick = () => openModal('login-modal');
        document.getElementById('btn-logout').onclick = async () => { await signOut(auth); showToast('Sesión cerrada', 'info'); };
        
        document.getElementById('search-input').oninput = renderReqs;
        document.getElementById('search-catalogo').oninput = renderCatalogo;
        document.getElementById('search-reg-articulo').oninput = renderRegistrarArticulos;
        
        document.getElementById('btn-confirm-ok').onclick = () => { if(confirmAction) confirmAction(); closeModal('confirm-modal'); };
        
        document.getElementById('btn-status-auth').onclick = () => setStatus('Autorizada');
        document.getElementById('btn-status-cob').onclick = () => setStatus('Cobrada');
        document.getElementById('btn-status-pen').onclick = () => setStatus('Pendiente');
        
        document.getElementById('btn-cancel-emp').onclick = cancelEditEmpleado;
        document.getElementById('btn-cancel-art').onclick = cancelEditArticulo;
        
        document.getElementById('admin-art-hasVariants').onchange = (e) => { 
            document.getElementById('admin-variants-container').style.display = e.target.checked ? 'block' : 'none'; 
            if (!e.target.checked) { document.getElementById('admin-art-variants').value = ''; } 
        };
        
        document.getElementById('reg-list-select').onchange = (e) => { currentRegListId = e.target.value; renderRegistrarListArticles(); };

        // --- FORMULARIO DE LOGIN ---
        document.getElementById('form-login').onsubmit = async (e) => { 
            e.preventDefault(); 
            const btn = document.getElementById('btn-login-submit');
            btn.disabled=true; 
            try { 
                await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-pass').value); 
                closeModal('login-modal'); 
                e.target.reset(); 
                showToast('Bienvenido, Admin'); 
            } catch(err) { 
                console.error(err);
                showToast('Credenciales incorrectas', 'error'); 
            } finally { 
                btn.disabled=false; 
            } 
        };
        
        // --- SUBMIT DE REGISTRO (REQUISICIÓN) ---
        document.getElementById('btn-registrar-submit').onclick = async () => {
            const numRequi = document.getElementById('reg-num-requi').value;
            const fecha = document.getElementById('reg-fecha').value;
            const empleadoId = document.getElementById('reg-selected-emp-id').value;
            const nombre = document.getElementById('reg-selected-emp-name').value;

            // Validaciones
            if (!empleadoId || !nombre) {
                document.getElementById('reg-emp-search').focus();
                return showToast('Por favor busca y selecciona un empleado válido', 'error');
            }
            if (articulosSeleccionados.length === 0) return showToast('No has seleccionado ningún artículo', 'error');
            if (!numRequi) return showToast('Ingresa un # de Requisición', 'error');

            const btn = document.getElementById('btn-registrar-submit'); 
            btn.disabled = true; 
            const originalText = btn.innerText;
            btn.innerHTML = '<svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Registrando...';

            try {
                let promises = [];
                for (const art of articulosSeleccionados) {
                    const articuloNombre = `[${art.num}] - ${art.nom} ${art.variant ? `(${art.variant})` : ''} - ${art.qty} pz`;
                    const reqData = { numRequi, empleadoId, nombre, articulo: articuloNombre, fecha, status: 'Pendiente', timestamp: new Date() };
                    promises.push(addDoc(colReqs, reqData));
                }
                await Promise.all(promises);
                
                showToast(`${articulosSeleccionados.length} requisición(es) registrada(s) con éxito`); 
                document.getElementById('btn-clear-emp').click(); 
                navigateTo('home-screen'); 
            } catch(err) { 
                console.error(err); 
                showToast('Error al registrar en base de datos', 'error'); 
            } finally { 
                btn.disabled = false; 
                btn.innerHTML = originalText; 
            }
        };

        // --- SUBMIT DE MODAL DE DETALLES (CANTIDAD/TALLA) ---
        document.getElementById('btn-item-details-submit').onclick = () => {
            const qty = parseInt(document.getElementById('item-qty').value, 10);
            const variantSelect = document.getElementById('variant-select');
            const selectedVariant = variantSelect.value;
            const needsVariant = document.getElementById('variant-container').style.display === 'block';
            
            if (!qty || qty < 1) { return showToast('Ingresa una cantidad válida', 'error'); }
            if (needsVariant && !selectedVariant) { return showToast('Debes seleccionar una talla o variante', 'error'); }
            
            if (currentItemForDetails) {
                const artData = artsMap.get(currentItemForDetails.num);
                articulosSeleccionados.push({ ...artData, variant: selectedVariant || null, qty: qty });
                renderCestaArticulos(); 
                closeModal('item-details-modal'); 
                currentItemForDetails = null;
            }
        };
        
        // --- FORMULARIO AÑADIR/EDITAR EMPLEADO ---
        document.getElementById('form-add-empleado').onsubmit = async (e) => { 
            e.preventDefault(); 
            const empId = e.target['admin-emp-id'].value;
            const empNombre = e.target['admin-emp-nombre'].value;
            
            if (editingEmpId) { 
                try { 
                    await updateDoc(doc(colEmps, editingEmpId), { id: empId, nombre: empNombre }); 
                    showToast('Empleado actualizado'); 
                    cancelEditEmpleado(); 
                } catch(err) { showToast('Error al actualizar', 'error'); } 
            } else { 
                if(empsMap.has(empId)) return showToast('ID duplicado', 'error'); 
                try { 
                    await addDoc(colEmps, {id: empId, nombre: empNombre}); 
                    showToast('Agregado'); 
                    e.target.reset(); 
                } catch(err){ showToast('Error', 'error'); } 
            }
        };
        
        // --- FORMULARIO AÑADIR/EDITAR ARTÍCULO (ACTUALIZADO) ---
        // --- FORMULARIO AÑADIR/EDITAR ARTÍCULO (ACTUALIZADO CON PRECIO) ---
document.getElementById('form-add-articulo').onsubmit = async (e) => { 
    e.preventDefault(); 
    const num = e.target['admin-art-num'].value.trim();
    const originalNum = document.getElementById('admin-art-original-num').value;
    const nom = e.target['admin-art-nom'].value.trim();
    const cat = e.target['admin-art-cat'].value;
    
    // --- NUEVO: Capturar Precio ---
    const precioRaw = e.target['admin-art-precio'].value;
    const precio = precioRaw ? parseFloat(precioRaw) : 0;
    // ------------------------------

    const img = e.target['admin-art-img'].value.trim();
    const hasVariants = e.target['admin-art-hasVariants'].checked;
    const variants = e.target['admin-art-variants'].value.trim();

    if(!cat) return showToast('Debes seleccionar una categoría', 'error');
    if(hasVariants && !variants) return showToast('Debes escribir las variantes separadas por coma', 'error');
    
    const assignedLists = []; 
    document.querySelectorAll('#admin-art-lists input[type="checkbox"]:checked').forEach(cb => assignedLists.push(cb.value));
    
    // Agregamos precio al objeto
    const artData = { num, nom, cat, precio, img, hasVariants, variants: hasVariants ? variants : null, assignedLists };
    
    if (editingArtId) { 
        if (num !== originalNum) {
            if (artsMap.has(num)) return showToast('El nuevo No. Parte ya existe en otro artículo', 'error');
        }
        try { 
            await updateDoc(doc(colArts, editingArtId), artData); 
            showToast('Artículo actualizado correctamente'); 
            cancelEditArticulo(); 
        } catch(err) { 
            console.error(err);
            showToast('Error al actualizar', 'error'); 
        } 
    } else { 
        if(artsMap.has(num)) return showToast('Ese No. Parte ya existe', 'error'); 
        try { 
            await addDoc(colArts, artData); 
            showToast('Artículo agregado'); 
            document.getElementById('admin-art-num').value = "";
            document.getElementById('admin-art-nom').value = "";
            document.getElementById('admin-art-precio').value = ""; // Limpiar precio
            document.getElementById('admin-art-num').focus();
        } catch(err){ 
            showToast('Error al crear', 'error'); 
        } 
    } 
};
        
        // --- FORMULARIO DE CATEGORÍA ---
        document.getElementById('form-add-categoria').onsubmit = async (e) => {
            e.preventDefault(); const catName = e.target['admin-cat-name'].value.trim();
            if (!catName) return; if (catsMap.has(catName)) { return showToast('Esa categoría ya existe', 'error'); }
            try { await addDoc(colCats, { name: catName }); showToast('Categoría agregada'); e.target.reset(); } catch (err) { console.error("Error al agregar categoría: ", err); showToast('Error al agregar', 'error'); }
        };
        
        // --- FORMULARIO DE LISTAS ---
        document.getElementById('form-add-list').onsubmit = async (e) => {
            e.preventDefault(); const listName = e.target['admin-list-name'].value.trim();
            if (!listName) return; if (Array.from(listsMap.values()).some(l => l.name === listName)) { return showToast('Esa lista ya existe', 'error'); }
            try { await addDoc(colLists, { name: listName }); showToast('Lista agregada'); e.target.reset(); } catch (err) { console.error("Error al agregar lista: ", err); showToast('Error al agregar', 'error'); }
        };
        
        // --- LÓGICA NUEVA: BUSCADOR DE EMPLEADOS (AUTOCOMPLETE) ---
        const empSearchInput = document.getElementById('reg-emp-search');
        const empResultsDiv = document.getElementById('reg-emp-results');
        const empClearBtn = document.getElementById('btn-clear-emp');
        const empIdHidden = document.getElementById('reg-selected-emp-id');
        const empNameHidden = document.getElementById('reg-selected-emp-name');

        // 1. Evento al escribir
        empSearchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase().trim();
            if (!term) {
                empResultsDiv.classList.add('hidden');
                empClearBtn.classList.add('hidden');
                empIdHidden.value = ''; 
                empNameHidden.value = '';
                return;
            }
            empClearBtn.classList.remove('hidden');

            const matches = Array.from(empsMap.values()).filter(emp => 
                (emp.nombre && emp.nombre.toLowerCase().includes(term)) || 
                (emp.id && emp.id.toString().includes(term))
            );

            if (matches.length > 0) {
                empResultsDiv.innerHTML = matches.map(emp => `
                    <div class="cursor-pointer select-none relative py-3 pl-3 pr-9 hover:bg-primary-50 transition border-b border-gray-50 last:border-0 text-sm" 
                         onclick="window.selectEmpleado('${emp.id}', '${emp.nombre}')">
                        <div class="flex justify-between items-center">
                            <span class="font-medium text-gray-900 truncate w-3/4">${emp.nombre}</span>
                            <span class="text-primary-600 font-bold text-xs bg-primary-50 px-2 py-1 rounded-full border border-primary-100">${emp.id}</span>
                        </div>
                    </div>
                `).join('');
            } else {
                empResultsDiv.innerHTML = '<div class="cursor-default select-none relative py-3 pl-3 pr-9 text-gray-400 text-sm italic text-center">No encontrado.</div>';
            }
            empResultsDiv.classList.remove('hidden');
        });

        // 2. Función global para seleccionar (window para que el HTML lo vea)
        window.selectEmpleado = (id, nombre) => {
            empIdHidden.value = id;
            empNameHidden.value = nombre;
            
            empSearchInput.value = `${nombre} (${id})`; 
            empSearchInput.classList.add('text-green-700', 'font-semibold', 'bg-green-50');
            
            empResultsDiv.classList.add('hidden');
        };

        // 3. Botón Limpiar (X)
        empClearBtn.addEventListener('click', () => {
            empSearchInput.value = '';
            empSearchInput.classList.remove('text-green-700', 'font-semibold', 'bg-green-50');
            empIdHidden.value = '';
            empNameHidden.value = '';
            empResultsDiv.classList.add('hidden');
            empClearBtn.classList.add('hidden');
            empSearchInput.focus();
        });

        // 4. Cerrar si clic fuera
        document.addEventListener('click', (e) => {
            if (empSearchInput && !empSearchInput.contains(e.target) && !empResultsDiv.contains(e.target)) {
                empResultsDiv.classList.add('hidden');
            }
        });
        
        
        // --- CARGA DE EXCEL (EMPLEADOS) ---
        document.getElementById('file-upload-emp').onchange = async (e) => {
            const f = e.target.files[0]; if(!f) return;
            const reader = new FileReader();
            reader.onload = async (evt) => {
                try {
                    const wb = XLSX.read(evt.target.result, {type: 'binary'}); const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header: 1});
                    let count = 0;
                    for(let i=0; i<data.length; i++) { if(data[i][0] && data[i][1] && !empsMap.has(data[i][0].toString())) { await addDoc(colEmps, {id: data[i][0].toString(), nombre: data[i][1].toString()}); count++; } }
                    showToast(`Cargados ${count} empleados`);
                } catch(err) { console.error(err); showToast('Error al leer archivo', 'error'); }
                e.target.value = '';
            };
            reader.readAsBinaryString(f);
        };

        // --- LÓGICA DE QR (INTEGRACIÓN) ---
        // A. Listener para el botón de Generar QR
        document.addEventListener('click', e => {
            const btnQR = e.target.closest('.btn-qr-cat');
            if (btnQR) {
                const catName = btnQR.dataset.n;
                mostrarModalQR(catName);
            }
        });
        // B. Función para mostrar el modal y generar el código
        function mostrarModalQR(categoria) {
            const container = document.getElementById('qrcode-container');
            const title = document.getElementById('qr-category-name');
            
            // Limpiar anterior
            container.innerHTML = '';
            title.innerText = categoria;

            // Construir la URL Mágica
            const urlBase = window.location.href.split('?')[0];
            const urlFinal = `${urlBase}?categoria=${encodeURIComponent(categoria)}`;

            // Generar el QR visual
            new QRCode(container, {
                text: urlFinal,
                width: 200,
                height: 200,
                colorDark : "#000000",
                colorLight : "#ffffff",
                correctLevel : QRCode.CorrectLevel.H
            });

            openModal('qr-modal');
        }

        // C. Función Global para Imprimir (disponible en window)
        window.imprimirQR = () => {
            const qrHTML = document.getElementById('qrcode-container').innerHTML;
            const catName = document.getElementById('qr-category-name').innerText;
            
            const ventana = window.open('', '', 'height=500,width=500');
            ventana.document.write(`
                <html>
                    <head>
                        <title>Etiqueta ${catName}</title>
                        <style>
                            body { font-family: sans-serif; text-align: center; padding: 20px; }
                            h2 { margin-bottom: 5px; font-size: 18px; }
                            p { font-size: 12px; color: #666; margin-top: 5px; }
                            .qr-box { display: inline-block; margin: 10px; }
                            img { width: 100%; max-width: 250px; }
                        </style>
                    </head>
                    <body>
                        <h2>${catName}</h2>
                        <div class="qr-box">${qrHTML}</div>
                        <p>Escanea para ver catálogo</p>
                    </body>
                </html>
            `);
            ventana.document.close();
            ventana.focus();
            setTimeout(() => {
                ventana.print();
                ventana.close();
            }, 500);
        };

        // --- LÓGICA DE ESTADÍSTICAS (TRAFICO DETALLADO CORREGIDO) ---
        async function registrarTrafico(categoriaQR = null) {
            const statsRef = doc(db, 'requi_toolcrib', 'stats');
            // Asegúrate que esta ruta coincida con la de tus reglas (3 segmentos)
            const logsRef = collection(db, 'requi_toolcrib', 'data', 'traffic_logs'); 
            
            // AQUÍ DECLARAMOS LA VARIABLE 'ahora'
            const ahora = new Date();
            
            try {
                // ACCIÓN 1: Actualizar Contadores
                await setDoc(statsRef, { lastUpdateCheck: ahora.toISOString() }, { merge: true });

                const updates = {
                    totalVisits: increment(1),
                    lastVisit: ahora.toISOString()
                };

                if (categoriaQR) {
                    updates[`scans.${categoriaQR}`] = increment(1); 
                    updates['sources.qr'] = increment(1);           
                } else {
                    updates['sources.direct'] = increment(1);       
                }
                await updateDoc(statsRef, updates);

                // ACCIÓN 2: Guardar el LOG (CORREGIDO: Usamos 'ahora' en lugar de 'now')
                await addDoc(logsRef, {
                    timestamp: ahora, // <--- CAMBIO AQUÍ
                    fecha: ahora.toLocaleDateString('es-MX'), // <--- CAMBIO AQUÍ
                    hora: ahora.toLocaleTimeString('es-MX'),  // <--- CAMBIO AQUÍ
                    tipo: categoriaQR ? 'QR' : 'Directo',
                    categoria: categoriaQR || 'N/A',
                    device: navigator.userAgent
                });
                
                console.log("📈 Log registrado correctamente.");
            } catch (error) {
                console.error("Error registrando tráfico:", error);
            }
        }
        
       function checkURLForQR() {
            const params = new URLSearchParams(window.location.search);
            const qrCategory = params.get('categoria');

            if (qrCategory) {
                // CASO A: Vienen de un QR
                console.log("🚀 Modo QR activado. Categoría:", qrCategory);
                
                // 1. Filtramos
                currentCategory = qrCategory;
                
                // 2. Vamos directo al catálogo
                navigateTo('catalogo-screen');

                // 3. Registramos como "QR Scan"
                registrarTrafico(qrCategory); 
                
                // 4. Ajustes visuales (Toast y ocultar botón de regresar)
                setTimeout(() => {
                    renderDynamicCategoryUI();
                    const backBtn = document.getElementById('main-back-btn');
                    if(backBtn) backBtn.classList.add('hidden');
                    showToast(`Categoría filtrada: ${qrCategory}`, 'info');
                }, 800);

            } else {
                // CASO B: Visita Normal (Teclearon la página o refrescaron)
                console.log("🏠 Visita Normal detectada");
                
                // 1. Registramos como "Directo"
                registrarTrafico(null);
                
                // 2. Vamos al Home
                navigateTo('home-screen');
            }
        }

        // --- INICIALIZACIÓN DE LA APP ---
        function setInitialIcons() {
            // Verificar que los elementos existan antes de asignarles HTML para evitar errores
            const empIcon = document.getElementById('emp-submit-icon');
            const artIcon = document.getElementById('art-submit-icon');
            
            if (empIcon) empIcon.innerHTML = iconAddSVG;
            if (artIcon) artIcon.innerHTML = iconAddSVG;
        }
        
        // 1. Cargamos íconos
        setInitialIcons();

        // 2. EJECUTAMOS EL ARRANQUE (Una sola vez)
        checkURLForQR();

