// No imports needed - THREE is provided via CDN in HTML

// --- Game Configuration & State ---
const CONFIG = {
    decayRates: {
        hunger: 0.8,    // per second
        energy: 0.5,
        hygiene: 0.6,
        happiness: 0.5
    },
    savingsGoal: 500,
    salary: 50 // per work session
};

const STATE = {
    money: 200,
    savings: 0,
    petName: "Buddy",
    petType: "dog",
    stats: {
        hunger: 100,
        energy: 100,
        hygiene: 100,
        happiness: 100
    },
    inventory: {
        food: 0,
        toys: [], // List of unlocked toys
        hatUnlocked: false
    },
    currentRoom: 'livingroom',
    lastTick: Date.now(),
    chores: {
        // Persistent Store: maps 'unique_chore_id' -> Array[cleaned_indices]
        progress: {}
    }
};

const CHORE_CONFIG = {
    dishes: {
        id: 'dishes', name: 'Dish Dynamo', reward: 5, energy: 10,
        lesson: "Consistent, small-scale labor pays off!",
        room: 'kitchen', count: 5, actionName: "Scrubbing Dish"
    },
    dusting: {
        id: 'dusting', name: 'Dusting the Hub', reward: 3, energy: 5,
        lesson: "Low-effort, entry-level work builds savings.",
        room: 'livingroom', count: 3, actionName: "Dusting"
    },
    recycling: {
        id: 'recycling', name: 'Recycling Sort', reward: 7, energy: 12,
        lesson: "Sustainability and organization are valuable skills.",
        room: 'livingroom', count: 1, actionName: "Sorting Recycling"
    },
    floors: {
        id: 'floors', name: 'Floor Polish', reward: 10, energy: 15,
        lesson: "Large-scale tasks take time but pay better.",
        room: ['livingroom', 'kitchen', 'bedroom', 'bathroom'], count: 4, global: true, actionName: "Polishing Floor"
    },
    laundry: {
        id: 'laundry', name: 'Laundry Specialist', reward: 6, energy: 10,
        lesson: "Cleanliness and order contribute to household value.",
        room: 'bedroom', count: 3, actionName: "Folding Laundry"
    },
    windows: {
        id: 'windows', name: 'Window Clarity', reward: 8, energy: 12,
        lesson: "Maintaining assets increases their longevity.",
        room: ['livingroom', 'bedroom'], count: 2, global: true, actionName: "Cleaning Window"
    },
    mirror: {
        id: 'mirror', name: 'Mirror Shine', reward: 4, energy: 5,
        lesson: "Attention to detail matters in small tasks.",
        room: 'bathroom', count: 4, actionName: "Wiping Mirror"
    }
};

// Helper
const getChoreInstanceId = (baseId, room) => {
    const cfg = CHORE_CONFIG[baseId];
    if (cfg.global) return `${baseId}_${room}`;
    return baseId;
};
const getChoreReward = (baseId) => {
    const cfg = CHORE_CONFIG[baseId];
    if (cfg.global && Array.isArray(cfg.room)) return cfg.reward / cfg.room.length;
    return cfg.reward;
};

// --- Three.js Globals ---
let scene, camera, renderer;
let petGroup, petMesh, emoteSprite;
let hatMesh;
let roomGroup;
let raycaster, pointer;

// --- Initialization ---
window.startGame = (type) => {
    const nameInput = document.getElementById('pet-name-input').value.trim();
    if (!nameInput) {
        showNotification("Please name your pet!", "error");
        return;
    }
    STATE.petType = type;
    STATE.petName = nameInput;

    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');

    initThreeJS();
    initGameLoop();

    showNotification(`Welcome, ${STATE.petName}!`, "success");
};

function initThreeJS() {
    const container = document.getElementById('canvas-container');

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x202025);
    scene.fog = new THREE.Fog(0x202025, 10, 50);

    // Camera
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 15);
    camera.lookAt(0, 0, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // Raycaster
    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();
    window.addEventListener('click', onMouseClick);
    window.addEventListener('resize', onWindowResize);

    // Build Initial Scene
    buildRoom();
    buildPet();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Scene Building ---
function buildRoom() {
    if (roomGroup) scene.remove(roomGroup);
    roomGroup = new THREE.Group();

    // Spawn items based on persistent state
    setupChores(STATE.currentRoom);
    updateTaskSidebar(); // Refresh UI for new room

    // Determine materials based on room
    let floorMat, wallColor, doorFrameColor, doorPanelColor;

    if (STATE.currentRoom === 'bathroom') {
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 64, 64);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, 32, 32); ctx.fillRect(32, 32, 32, 32);
        const tex = new THREE.CanvasTexture(canvas);
        tex.magFilter = THREE.NearestFilter;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(10, 10);

        floorMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 });
        wallColor = 0xf1f5f9;
        doorFrameColor = 0xffffff;
        doorPanelColor = 0xe2e8f0;
    } else {
        floorMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 });
        wallColor = 0x475569;
        doorFrameColor = 0x1e293b;
        doorPanelColor = 0x64748b;
    }

    // Floor
    const floorGeo = new THREE.PlaneGeometry(30, 30);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    roomGroup.add(floor);

    // Walls
    const wallMat = new THREE.MeshStandardMaterial({ color: wallColor });
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(30, 10, 1), wallMat);
    backWall.position.set(0, 5, -15);
    backWall.receiveShadow = true;
    roomGroup.add(backWall);

    const sideWallGeo = new THREE.BoxGeometry(1, 10, 30);
    const leftWall = new THREE.Mesh(sideWallGeo, wallMat);
    leftWall.position.set(-15, 5, 0);
    leftWall.receiveShadow = true;
    roomGroup.add(leftWall);

    const rightWall = new THREE.Mesh(sideWallGeo, wallMat);
    rightWall.position.set(15, 5, 0);
    rightWall.receiveShadow = true;
    roomGroup.add(rightWall);

    // --- Room Configs ---
    if (STATE.currentRoom === 'livingroom') {
        createFurniture(13, 0, 0, 0x1e293b, "Sofa", -Math.PI / 2);
        createComputer(0, 2, -14);

        createDoor(-8, 0, -14.5, 0, 'kitchen', 0xf97316);
        createDoor(8, 0, -14.5, 0, 'bathroom', 0x3b82f6);
        createDoor(-14.5, 0, 0, Math.PI / 2, 'bedroom', 0x8b5cf6);

        // Windows
        createWindow(-12.5, 6, -14.4, 0, 2.5, 3.5);
        createWindow(12.5, 6, -14.4, 0, 2.5, 3.5);
        createWindow(14.4, 5, 0, -Math.PI / 2, 8, 3.5);

    } else if (STATE.currentRoom === 'kitchen') {
        createKitchenFixtures();
        createDoor(0, 0, -14.5, 0, 'livingroom', 0x14b8a6);

    } else if (STATE.currentRoom === 'bedroom') {
        createBedroomFixtures();
        createDoor(14.5, 0, -4, -Math.PI / 2, 'livingroom', 0x14b8a6);

    } else if (STATE.currentRoom === 'bathroom') {
        createBathroomFixtures();
        createDoor(-8, 0, -14.5, 0, 'livingroom', 0x14b8a6, doorFrameColor, doorPanelColor);
    }

    if (STATE.currentRoom === 'livingroom') {
        renderToys();
    }

    scene.add(roomGroup);
}

function setupChores(room) {
    const makeInteractable = (mesh, baseId, subId) => {
        const uniqueId = getChoreInstanceId(baseId, room);
        mesh.userData = {
            type: 'interactable',
            action: `doChore:${baseId}:${uniqueId}:${subId}`,
            choreId: baseId
        };
        return mesh;
    };

    const isCleaned = (baseId, subId) => {
        const uniqueId = getChoreInstanceId(baseId, room);
        const progress = STATE.chores.progress[uniqueId] || [];
        return progress.includes(subId);
    }

    // 1. DISHES
    if (room === 'kitchen') {
        for (let i = 0; i < CHORE_CONFIG.dishes.count; i++) {
            if (isCleaned('dishes', i)) continue;
            const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.4, 0.05, 16), new THREE.MeshStandardMaterial({ color: 0xe2e8f0 }));
            const grime = new THREE.Mesh(new THREE.CircleGeometry(0.3, 8), new THREE.MeshBasicMaterial({ color: 0x5c4033, opacity: 0.7, transparent: true }));
            grime.rotation.x = -Math.PI / 2;
            grime.position.y = 0.03;
            plate.add(grime);
            plate.position.set(0 + (Math.random() * 0.5), 3.6 + (i * 0.06), -13.5 + (Math.random() * 0.5));
            roomGroup.add(makeInteractable(plate, 'dishes', i));
        }
    }

    // 2. DUSTING
    if (room === 'livingroom') {
        for (let i = 0; i < CHORE_CONFIG.dusting.count; i++) {
            if (isCleaned('dusting', i)) continue;
            const dustGroup = new THREE.Group();
            const particleMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, transparent: true, opacity: 0.8, roughness: 1 });
            for (let px = 0; px < 5; px++) {
                const size = 0.1 + Math.random() * 0.15;
                const p = new THREE.Mesh(new THREE.SphereGeometry(size, 4, 4), particleMat);
                p.position.set((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.4);
                dustGroup.add(p);
            }
            // Side positions
            const positions = [
                { x: -8, y: 0.2, z: 2 },   // Far Left
                { x: 8, y: 0.2, z: 2 },    // Far Right
                { x: 6, y: 0.2, z: 6 }     // Front Right
            ];
            const pos = positions[i] || { x: i, y: 0, z: 0 };
            dustGroup.position.set(pos.x + (Math.random() - 0.5), pos.y, pos.z + (Math.random() - 0.5));

            const hitBox = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.8), new THREE.MeshBasicMaterial({ color: 0xff0000, visible: true, transparent: true, opacity: 0 }));
            dustGroup.add(hitBox);
            roomGroup.add(makeInteractable(dustGroup, 'dusting', i));
        }
    }

    // 3. RECYCLING
    if (room === 'livingroom' && !isCleaned('recycling', 0)) {
        const binGroup = new THREE.Group();
        binGroup.position.set(-10, 0, 10);
        const colors = [0x3b82f6, 0x22c55e, 0xef4444];
        colors.forEach((col, idx) => {
            const bin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2, 1.5), new THREE.MeshStandardMaterial({ color: col }));
            bin.position.set(idx * 2, 1, 0);
            binGroup.add(bin);
        });
        roomGroup.add(binGroup);
        const trash = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6), new THREE.MeshStandardMaterial({ color: 0x475569, wireframe: true }));
        trash.position.set(-8, 0.6, 8);
        roomGroup.add(makeInteractable(trash, 'recycling', 0));
    }

    // 4. FLOORS
    if (CHORE_CONFIG.floors.room.includes(room)) {
        for (let i = 0; i < CHORE_CONFIG.floors.count; i++) {
            if (isCleaned('floors', i)) continue;
            const grime = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshStandardMaterial({ color: 0x332f2c, transparent: true, opacity: 0.8 }));
            grime.rotation.x = -Math.PI / 2;
            const rx = (Math.random() * 17) - 12; // Left side
            const rz = (Math.random() * 20) - 10;
            grime.position.set(rx, 0.05, rz);
            roomGroup.add(makeInteractable(grime, 'floors', i));
        }
    }

    // 5. LAUNDRY
    if (room === 'bedroom') {
        const basket = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1, 1.5, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0xd97706, side: THREE.DoubleSide }));
        basket.position.set(-10, 0.75, 10);
        roomGroup.add(basket);
        for (let i = 0; i < CHORE_CONFIG.laundry.count; i++) {
            if (isCleaned('laundry', i)) continue;
            const clothes = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.8), new THREE.MeshStandardMaterial({ color: Math.random() * 0xffffff }));
            clothes.rotation.y = Math.random() * Math.PI;
            clothes.position.set((Math.random() * 10) - 5, 0.1, (Math.random() * 10) - 5);
            roomGroup.add(makeInteractable(clothes, 'laundry', i));
        }
    }

    // 6. WINDOWS
    if (CHORE_CONFIG.windows.room.includes(room)) {
        let winPositions = [];
        if (room === 'livingroom') winPositions = [
            { x: 12.5, y: 5.5, z: -14.3 },
            { x: 11.5, y: 4.5, z: -14.3 }
        ];
        winPositions.forEach((pos, idx) => {
            if (isCleaned('windows', idx)) return;
            const grime = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x57534e, transparent: true, opacity: 0.7 }));
            grime.position.set(pos.x, pos.y, pos.z);
            if (pos.rot) grime.rotation.y = pos.rot;
            if (pos.rot) grime.position.x -= 0.1; else grime.position.z += 0.1;
            roomGroup.add(makeInteractable(grime, 'windows', idx));
        });
    }

    // 7. MIRROR
    if (room === 'bathroom') {
        const fogPos = [{ x: -0.5, y: 5.5 }, { x: 0.5, y: 5.5 }, { x: -0.5, y: 4.5 }, { x: 0.5, y: 4.5 }];
        fogPos.forEach((p, i) => {
            if (isCleaned('mirror', i)) return;
            const fog = new THREE.Mesh(new THREE.CircleGeometry(0.4, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }));
            fog.position.set(p.x, p.y, -14.8);
            roomGroup.add(makeInteractable(fog, 'mirror', i));
        });
    }
}

function createDoor(x, y, z, rotationY, targetRoom, colorHex, frameColor = 0x1e293b, panelColor = 0x64748b) {
    const doorGroup = new THREE.Group();
    doorGroup.position.set(x, y, z);
    doorGroup.rotation.y = rotationY;
    doorGroup.userData = { type: 'interactable', action: `changeRoom:${targetRoom}` };

    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(5, 8, 1), new THREE.MeshStandardMaterial({ color: frameColor }));
    doorFrame.position.y = 4;
    doorGroup.add(doorFrame);

    const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(4, 7.5, 0.2), new THREE.MeshStandardMaterial({ color: panelColor }));
    doorPanel.position.set(0, 3.8, 0.6);
    doorGroup.add(doorPanel);

    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshStandardMaterial({ color: colorHex }));
    knob.position.set(1.5, 3.5, 0.8);
    doorGroup.add(knob);

    const sign = new THREE.Mesh(new THREE.BoxGeometry(3, 0.8, 0.2), new THREE.MeshStandardMaterial({ color: colorHex }));
    sign.position.set(0, 8.5, 0);
    doorGroup.add(sign);

    const hitBox = new THREE.Mesh(new THREE.BoxGeometry(5, 8, 2), new THREE.MeshBasicMaterial({ visible: false }));
    hitBox.position.y = 4;
    doorGroup.add(hitBox);

    roomGroup.add(doorGroup);
}

function createWindow(x, y, z, rotationY, width = 3, height = 4) {
    const winGroup = new THREE.Group();
    winGroup.position.set(x, y, z);
    winGroup.rotation.y = rotationY;

    const frameGeo = new THREE.BoxGeometry(width + 0.4, height + 0.4, 0.2);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    winGroup.add(frame);

    const skyGeo = new THREE.PlaneGeometry(width, height);
    const skyMat = new THREE.MeshBasicMaterial({ color: 0x87ceeb });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.position.z = 0.11;
    winGroup.add(sky);

    const glassGeo = new THREE.PlaneGeometry(width, height);
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, roughness: 0, metalness: 0.9 });
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.position.z = 0.12;
    winGroup.add(glass);

    const barV = new THREE.Mesh(new THREE.BoxGeometry(0.2, height, 0.1), frameMat);
    barV.position.z = 0.13;
    winGroup.add(barV);

    const barH = new THREE.Mesh(new THREE.BoxGeometry(width, 0.2, 0.1), frameMat);
    barH.position.z = 0.13;
    winGroup.add(barH);

    roomGroup.add(winGroup);
}

function createBathroomFixtures() {
    const tubGroup = new THREE.Group();
    tubGroup.position.set(6, 0, -10);
    const tubMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.8, roughness: 0.2 });

    const tubBottom = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 3), tubMat); tubBottom.position.y = 0.25; tubGroup.add(tubBottom);
    const wallFront = new THREE.Mesh(new THREE.BoxGeometry(6, 2, 0.2), tubMat); wallFront.position.set(0, 1.5, 1.4); tubGroup.add(wallFront);
    const wallBack = new THREE.Mesh(new THREE.BoxGeometry(6, 2, 0.2), tubMat); wallBack.position.set(0, 1.5, -1.4); tubGroup.add(wallBack);
    const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2, 2.6), tubMat); wallLeft.position.set(-2.9, 1.5, 0); tubGroup.add(wallLeft);
    const wallRight = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2, 2.6), tubMat); wallRight.position.set(2.9, 1.5, 0); tubGroup.add(wallRight);

    const water = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.5, 2.6), new THREE.MeshStandardMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.6 }));
    water.position.set(0, 1.0, 0);
    tubGroup.add(water);

    const tFaucetV = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.5), chromeMat); tFaucetV.position.set(0, 1.25, -1.6); tubGroup.add(tFaucetV);
    const tFaucetH = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.8), chromeMat); tFaucetH.position.set(0, 2.5, -1.2); tFaucetH.rotation.x = Math.PI / 2; tubGroup.add(tFaucetH);
    const tFaucetTip = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.3), chromeMat); tFaucetTip.position.set(0, 2.5, -0.8); tubGroup.add(tFaucetTip);

    tubGroup.userData = { type: 'interactable', action: 'cleanPet' };
    const tubHit = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 3), new THREE.MeshBasicMaterial({ visible: false })); tubHit.position.y = 1.5; tubGroup.add(tubHit);
    roomGroup.add(tubGroup);

    const toiletGroup = new THREE.Group(); toiletGroup.position.set(-13, 0, -14);
    const tBase = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 2), tubMat); tBase.position.y = 0.75; toiletGroup.add(tBase);
    const tTank = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2, 0.8), tubMat); tTank.position.set(0, 2.5, -0.6); toiletGroup.add(tTank);
    roomGroup.add(toiletGroup);

    const sinkGroup = new THREE.Group(); sinkGroup.position.set(0, 0, -14);
    const sPedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 3), tubMat); sPedestal.position.y = 1.5; sinkGroup.add(sPedestal);
    const sBasin = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 1.5), tubMat); sBasin.position.y = 3; sinkGroup.add(sBasin);
    const sFaucetV = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5), chromeMat); sFaucetV.position.set(0, 3.25, -0.6); sinkGroup.add(sFaucetV);
    const sFaucetH = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5), chromeMat); sFaucetH.position.set(0, 3.5, -0.4); sFaucetH.rotation.x = Math.PI / 2; sinkGroup.add(sFaucetH);
    const sTip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2), chromeMat); sTip.position.set(0, 3.4, -0.15); sinkGroup.add(sTip);
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(2, 3), new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.1 })); mirror.position.set(0, 5, -14.9); roomGroup.add(mirror);
    roomGroup.add(sinkGroup);
}

function createFurniture(x, y, z, color, type, rotationY = 0) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotationY;
    if (type === "Sofa") {
        const mat = new THREE.MeshStandardMaterial({ color: color });
        const seat = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 2), mat); seat.position.y = 0.5; seat.castShadow = true; seat.receiveShadow = true; group.add(seat);
        const back = new THREE.Mesh(new THREE.BoxGeometry(4, 2.5, 0.5), mat); back.position.set(0, 1.25, -0.75); back.castShadow = true; back.receiveShadow = true; group.add(back);
        const armGeo = new THREE.BoxGeometry(0.5, 1.5, 2);
        const armL = new THREE.Mesh(armGeo, mat); armL.position.set(-1.75, 0.75, 0); armL.castShadow = true; armL.receiveShadow = true; group.add(armL);
        const armR = new THREE.Mesh(armGeo, mat); armR.position.set(1.75, 0.75, 0); armR.castShadow = true; armR.receiveShadow = true; group.add(armR);
    } else {
        const geo = new THREE.BoxGeometry(4, 2, 2);
        const mat = new THREE.MeshStandardMaterial({ color: color });
        const mesh = new THREE.Mesh(geo, mat); mesh.position.y = 1; mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
    }
    group.userData = { type: 'furniture', name: type };
    roomGroup.add(group);
}

function createBedroomFixtures() {
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x78350f });
    const mattressMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const sheetMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6 });
    const pillowMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0 });

    const bedGroup = new THREE.Group(); bedGroup.position.set(0, 0, -10);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(8, 2, 7), woodMat); frame.position.y = 1; bedGroup.add(frame);
    const headboard = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 0.5), woodMat); headboard.position.set(0, 3, -3.25); bedGroup.add(headboard);
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(7.5, 1, 6.5), mattressMat); mattress.position.y = 2.5; bedGroup.add(mattress);
    const sheets = new THREE.Mesh(new THREE.BoxGeometry(7.6, 1.1, 4), sheetMat); sheets.position.set(0, 2.5, 1.25); bedGroup.add(sheets);
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.8, 1.5), pillowMat); p1.position.set(-2, 3.2, -2); bedGroup.add(p1);
    const p2 = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.8, 1.5), pillowMat); p2.position.set(2, 3.2, -2); bedGroup.add(p2);
    bedGroup.userData = { type: 'interactable', action: 'sleep' };
    roomGroup.add(bedGroup);

    const nsGeo = new THREE.BoxGeometry(2, 2.5, 2);
    const nsL = new THREE.Mesh(nsGeo, woodMat); nsL.position.set(-5.5, 1.25, -12); roomGroup.add(nsL);
    const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x000000 })); lampBase.position.set(-5.5, 2.75, -12); roomGroup.add(lampBase);
    const lampShade = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1, 4, 1, true), new THREE.MeshStandardMaterial({ color: 0xfff7ed, transparent: true, opacity: 0.9 })); lampShade.position.set(-5.5, 3.5, -12); roomGroup.add(lampShade);

    const nsR = new THREE.Mesh(nsGeo, woodMat); nsR.position.set(5.5, 1.25, -12); roomGroup.add(nsR);
    const lampBaseR = lampBase.clone(); lampBaseR.position.set(5.5, 2.75, -12); roomGroup.add(lampBaseR);
    const lampShadeR = lampShade.clone(); lampShadeR.position.set(5.5, 3.5, -12); roomGroup.add(lampShadeR);
}

function createKitchenFixtures() {
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.6, roughness: 0.3 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x78350f });

    const fridgeGroup = new THREE.Group(); fridgeGroup.position.set(-13, 0, -13);
    const fridgeBody = new THREE.Mesh(new THREE.BoxGeometry(3, 7, 3), whiteMat); fridgeBody.position.y = 3.5; fridgeGroup.add(fridgeBody);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.5, 0.2), chromeMat); handle.position.set(1, 4, 1.6); fridgeGroup.add(handle);
    const handleLower = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.5, 0.2), chromeMat); handleLower.position.set(1, 2, 1.6); fridgeGroup.add(handleLower);
    fridgeGroup.userData = { type: 'interactable', action: 'openFridge' };
    roomGroup.add(fridgeGroup);

    const counterHeight = 3.5;
    const cabMesh = new THREE.Mesh(new THREE.BoxGeometry(5, counterHeight, 3), woodMat); cabMesh.position.set(-9, counterHeight / 2, -13); roomGroup.add(cabMesh);
    const counterTop = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.2, 3.2), chromeMat); counterTop.position.set(-9, counterHeight, -13); roomGroup.add(counterTop);

    const microGroup = new THREE.Group(); microGroup.position.set(-9, counterHeight + 1, -13);
    microGroup.add(new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.5, 1.5), whiteMat));
    const mWindow = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.8), new THREE.MeshStandardMaterial({ color: 0x000000 })); mWindow.position.z = 0.76; microGroup.add(mWindow);
    roomGroup.add(microGroup);

    const stoveGroup = new THREE.Group(); stoveGroup.position.set(-5, 0, -13);
    const stoveBody = new THREE.Mesh(new THREE.BoxGeometry(3, counterHeight, 3), new THREE.MeshStandardMaterial({ color: 0xe2e8f0 })); stoveBody.position.y = counterHeight / 2; stoveGroup.add(stoveBody);
    const burnerGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.1); const burnerMat = new THREE.MeshStandardMaterial({ color: 0x0f172a });
    const b1 = new THREE.Mesh(burnerGeo, burnerMat); b1.position.set(-0.7, counterHeight + 0.05, 0.7); stoveGroup.add(b1);
    const b2 = new THREE.Mesh(burnerGeo, burnerMat); b2.position.set(0.7, counterHeight + 0.05, 0.7); stoveGroup.add(b2);
    const b3 = new THREE.Mesh(burnerGeo, burnerMat); b3.position.set(-0.7, counterHeight + 0.05, -0.7); stoveGroup.add(b3);
    const b4 = new THREE.Mesh(burnerGeo, burnerMat); b4.position.set(0.7, counterHeight + 0.05, -0.7); stoveGroup.add(b4);
    const ovenWin = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.5), new THREE.MeshStandardMaterial({ color: 0x000000 })); ovenWin.position.set(0, 1.8, 1.51); stoveGroup.add(ovenWin);
    roomGroup.add(stoveGroup);

    const tableGroup = new THREE.Group(); tableGroup.position.set(8, 0, -5);
    const tTop = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.2, 32), new THREE.MeshStandardMaterial({ color: 0xffedd5 })); tTop.position.y = 2.5; tableGroup.add(tTop);
    const tLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 2.5), new THREE.MeshStandardMaterial({ color: 0x78350f })); tLeg.position.y = 1.25; tableGroup.add(tLeg);
    for (let i = 0; i < 4; i++) {
        const chair = new THREE.Group(); const angle = (i / 4) * Math.PI * 2; const radius = 5;
        chair.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
        chair.lookAt(Math.cos(angle) * radius * 2, 0, Math.sin(angle) * radius * 2);
        const seat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.2, 1.5), woodMat); seat.position.y = 1.2; chair.add(seat);
        const back = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 0.2), woodMat); back.position.set(0, 2, 0.65); chair.add(back);
        const cBase = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.2), woodMat); cBase.position.y = 0.6; chair.add(cBase);
        tableGroup.add(chair);
    }
    roomGroup.add(tableGroup);
}

function createComputer(x, y, z) {
    const group = new THREE.Group(); group.position.set(x, y, z);
    const desk = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 2), new THREE.MeshStandardMaterial({ color: 0x5c3a21 })); group.add(desk);
    const monitor = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1, 0.1), new THREE.MeshStandardMaterial({ color: 0x000000 })); monitor.position.set(0, 0.6, 0); group.add(monitor);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.8), new THREE.MeshBasicMaterial({ color: 0x00ff00 })); screen.position.set(0, 0.6, 0.06); group.add(screen);
    group.userData = { type: 'interactable', action: 'openMarket' };
    const hitBox = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 2), new THREE.MeshBasicMaterial({ visible: false }));
    hitBox.userData = { type: 'interactable', action: 'openMarket' };
    group.add(hitBox);
    roomGroup.add(group);
}

function renderToys() {
    if (STATE.inventory.toys.includes('ball')) {
        const ballGeo = new THREE.SphereGeometry(1, 32, 32);
        const ballMat = new THREE.MeshStandardMaterial({ color: 0xff4757 });
        const ball = new THREE.Mesh(ballGeo, ballMat);
        ball.position.set(5, 1, 8); ball.castShadow = true; ball.receiveShadow = true;
        ball.userData = { type: 'interactable', action: 'playWithToy' };
        roomGroup.add(ball);
    }
}

function buildPet() {
    if (petGroup) scene.remove(petGroup);
    petGroup = new THREE.Group();

    const mainColor = STATE.petType === 'dog' ? 0xd97706 : (STATE.petType === 'cat' ? 0x94a3b8 : 0xe2e8f0);
    const secondaryColor = 0xffffff;
    const matInfo = {
        body: new THREE.MeshStandardMaterial({ color: mainColor }),
        accent: new THREE.MeshStandardMaterial({ color: secondaryColor }),
        dark: new THREE.MeshStandardMaterial({ color: 0x1e293b })
    };

    if (['dog', 'cat', 'rabbit'].includes(STATE.petType)) {
        const bodyScale = STATE.petType === 'rabbit' ? 0.7 : 1;
        const bodyMsg = new THREE.Mesh(new THREE.BoxGeometry(1.2 * bodyScale, 1 * bodyScale, 1.8 * bodyScale), matInfo.body);
        bodyMsg.position.y = 1 * bodyScale; bodyMsg.castShadow = true; petGroup.add(bodyMsg);

        const headGroup = new THREE.Group(); headGroup.position.set(0, 1.8, 0.8);
        headGroup.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), matInfo.body));

        const snoutLen = STATE.petType === 'dog' ? 0.6 : 0.2;
        const snoutMesh = new THREE.Mesh(new THREE.BoxGeometry(0.6 * (STATE.petType === 'rabbit' ? 0.8 : 1), 0.4, snoutLen), matInfo.accent);
        snoutMesh.position.set(0, -0.1, 0.5 + snoutLen / 2); headGroup.add(snoutMesh);

        const noseMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.1), matInfo.dark);
        noseMesh.position.set(0, 0.05, 0.5 + snoutLen); headGroup.add(noseMesh);

        let earGeo, earPosL, earPosR, earRotL, earRotR;
        if (STATE.petType === 'rabbit') {
            earGeo = new THREE.BoxGeometry(0.2, 1.2, 0.1);
            earPosL = new THREE.Vector3(-0.25, 1.0, 0); earPosR = new THREE.Vector3(0.25, 1.0, 0);
            earRotL = { x: 0, z: -0.1 }; earRotR = { x: 0, z: 0.1 };
        } else {
            earGeo = new THREE.ConeGeometry(0.2, 0.4, 4);
            earPosL = new THREE.Vector3(-0.35, 0.6, 0); earPosR = new THREE.Vector3(0.35, 0.6, 0);
            earRotL = { x: -0.2, z: 0.2 }; earRotR = { x: -0.2, z: -0.2 };
        }
        const earL = new THREE.Mesh(earGeo, matInfo.body); earL.position.copy(earPosL); earL.rotation.x = earRotL.x; earL.rotation.z = earRotL.z;
        const earR = new THREE.Mesh(earGeo, matInfo.body); earR.position.copy(earPosR); earR.rotation.x = earRotR.x; earR.rotation.z = earRotR.z;
        headGroup.add(earL); headGroup.add(earR);

        const eyeGeo = new THREE.BoxGeometry(0.15, 0.15, 0.1);
        const eyeL = new THREE.Mesh(eyeGeo, matInfo.dark); eyeL.position.set(-0.25, 0.1, 0.5); headGroup.add(eyeL);
        const eyeR = new THREE.Mesh(eyeGeo, matInfo.dark); eyeR.position.set(0.25, 0.1, 0.5); headGroup.add(eyeR);
        petGroup.add(headGroup);

        const legGeo = new THREE.BoxGeometry(0.35, 0.8, 0.35);
        [{ x: -0.4, y: 0.4, z: 0.6 }, { x: 0.4, y: 0.4, z: 0.6 }, { x: -0.4, y: 0.4, z: -0.6 }, { x: 0.4, y: 0.4, z: -0.6 }].forEach(pos => {
            const leg = new THREE.Mesh(legGeo, matInfo.body); leg.position.set(pos.x, pos.y, pos.z); leg.castShadow = true; petGroup.add(leg);
        });

        const tailGeo = STATE.petType === 'rabbit' ? new THREE.SphereGeometry(0.25) : new THREE.BoxGeometry(0.2, 0.2, 0.8);
        const tail = new THREE.Mesh(tailGeo, matInfo.body); tail.position.set(0, 1.4 * bodyScale, -0.9 * bodyScale);
        if (STATE.petType !== 'rabbit') tail.rotation.x = 0.5;
        petGroup.add(tail);
    }

    if (STATE.inventory.hatUnlocked) {
        const hatGeo = new THREE.CylinderGeometry(0.4, 0.6, 0.5, 8);
        const hatMat = new THREE.MeshStandardMaterial({ color: 0xfacc15 });
        hatMesh = new THREE.Mesh(hatGeo, hatMat);
        hatMesh.position.set(0, 2.5, 0.8);
        petGroup.add(hatMesh);
    }

    const petHit = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 2), new THREE.MeshBasicMaterial({ visible: false }));
    petHit.position.y = 1.5;
    petGroup.add(petHit);

    scene.add(petGroup);
}

// --- Game Logic & Utils ---
function initGameLoop() {
    // Stat Decay Loop
    setInterval(() => {
        decayStats();
        updateUI();
        updatePetBehavior();
    }, 1000);

    // Rendering Loop
    renderer.setAnimationLoop(animate);
}

function decayStats() {
    STATE.stats.hunger = Math.max(0, STATE.stats.hunger - CONFIG.decayRates.hunger);
    STATE.stats.energy = Math.max(0, STATE.stats.energy - CONFIG.decayRates.energy);
    STATE.stats.hygiene = Math.max(0, STATE.stats.hygiene - CONFIG.decayRates.hygiene);

    if (STATE.stats.hunger < 20 && Math.random() < 0.1) showNotification(`${STATE.petName} is hungry!`, "warning");
    if (STATE.stats.energy < 20 && Math.random() < 0.1) showNotification(`${STATE.petName} is tired!`, "warning");

    let happinessDecay = CONFIG.decayRates.happiness;
    if (STATE.stats.hunger < 40) happinessDecay *= 1.5;
    if (STATE.stats.hygiene < 40) happinessDecay *= 1.2;
    STATE.stats.happiness = Math.max(0, STATE.stats.happiness - happinessDecay);
}

function updateUI() {
    document.getElementById('val-hunger').innerText = Math.floor(STATE.stats.hunger);
    document.getElementById('bar-hunger').style.width = `${STATE.stats.hunger}%`;
    document.getElementById('val-energy').innerText = Math.floor(STATE.stats.energy);
    document.getElementById('bar-energy').style.width = `${STATE.stats.energy}%`;
    document.getElementById('val-hygiene').innerText = Math.floor(STATE.stats.hygiene);
    document.getElementById('bar-hygiene').style.width = `${STATE.stats.hygiene}%`;
    document.getElementById('val-happiness').innerText = Math.floor(STATE.stats.happiness);
    document.getElementById('bar-happiness').style.width = `${STATE.stats.happiness}%`;
    document.getElementById('display-money').innerText = STATE.money.toFixed(2);
    document.getElementById('display-savings').innerText = STATE.savings;
}

function updatePetBehavior() {
    let emotion = "Happy";
    let emoji = "😊";
    if (STATE.stats.hunger < 30) { emotion = "Hungry"; emoji = "🤤"; }
    else if (STATE.stats.energy < 20) { emotion = "Sleepy"; emoji = "😴"; }
    else if (STATE.stats.happiness < 30) { emotion = "Sad"; emoji = "😢"; }
    else if (STATE.stats.happiness > 80 && STATE.stats.energy > 50) { emotion = "Excited"; emoji = "🤩"; }
    else if (STATE.stats.energy > 80) { emotion = "Happy"; emoji = "😊"; }
    document.getElementById('pet-emoji').innerText = emoji;
    document.getElementById('pet-status-text').innerText = emotion;

    if (petGroup) {
        petGroup.position.y = Math.max(0, petGroup.position.y * 0.9);
        petGroup.rotation.z = 0;
        petGroup.position.x = 0;
        if (emotion === "Excited") petGroup.position.y = Math.abs(Math.sin(Date.now() / 200)) * 0.5;
        else if (emotion === "Sleepy") petGroup.rotation.z = Math.PI / 4;
    }
}

function onMouseClick(event) {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    if (intersects.length > 0) {
        let obj = intersects[0].object;
        while (obj) {
            if (obj.userData && obj.userData.type === 'interactable') {
                handleInteraction(obj.userData.action, obj);
                break;
            }
            obj = obj.parent;
        }
    }
}

function handleInteraction(action, object) {
    if (!action) return;

    if (action.startsWith('doChore:')) {
        const parts = action.split(':');
        const baseId = parts[1];
        const uniqueId = parts[2];
        const subId = parseInt(parts[3]);
        const choreDef = CHORE_CONFIG[baseId];

        if (choreDef) {
            if (!STATE.chores.progress[uniqueId]) STATE.chores.progress[uniqueId] = [];
            if (STATE.chores.progress[uniqueId].includes(subId)) return;

            const cost = Math.ceil(choreDef.energy / choreDef.count) || 1;
            if (STATE.stats.energy < cost) {
                showNotification("Too tired! Sleep to restore energy.", "warning");
                return;
            }
            STATE.stats.energy = Math.max(0, STATE.stats.energy - cost);
            STATE.chores.progress[uniqueId].push(subId);

            if (object) {
                object.userData.type = 'ignore';
                object.visible = false;
                object.position.y = -1000;
                spawnMoneyParticles(object.position.clone().add(new THREE.Vector3(0, 1, 0)));
            }
            showActionIndicator(`${choreDef.actionName || 'Working'}...`);

            if (STATE.chores.progress[uniqueId].length >= choreDef.count) {
                const reward = getChoreReward(baseId);
                STATE.money += reward;
                showNotification(`Task Complete! +$${reward.toFixed(2)}`, "success");
                showNotification(choreDef.lesson, "info");
            }
            updateUI();
            updateTaskSidebar();
        }
        return;
    }

    if (action === 'openMarket') { document.getElementById('modal-marketplace').classList.remove('hidden'); }
    if (action === 'openFridge') { updateFridgeUI(); document.getElementById('modal-fridge').classList.remove('hidden'); }
    if (action && action.startsWith('changeRoom:')) { changeRoom(action.split(':')[1]); }
    if (action === 'cleanPet') {
        STATE.stats.hygiene = 100;
        showNotification("Squeaky clean! 🛁", "success");
        updateUI();
        if (petGroup) {
            let spins = 0;
            const spinInterval = setInterval(() => {
                petGroup.rotation.y += 0.5; spins++;
                if (spins > 20) { clearInterval(spinInterval); petGroup.rotation.y = 0; }
            }, 50);
        }
    }
    if (action === 'sleep') {
        STATE.stats.energy = 100;
        showNotification("Zzz... Rested up! Energy 100", "success");
        updateUI();
        if (petGroup) {
            petGroup.rotation.z = Math.PI / 2;
            setTimeout(() => { if (petGroup) petGroup.rotation.z = 0; }, 2000);
        }
    }
    if (action === 'playWithToy') {
        if (STATE.stats.energy < 10) { showNotification(`${STATE.petName} is too tired to play!`, "warning"); return; }
        STATE.stats.happiness = Math.min(100, STATE.stats.happiness + 20);
        STATE.stats.energy = Math.max(0, STATE.stats.energy - 10);
        showNotification(`Played with Toy! Happiness +20`, "success");
        updateUI();
        if (petGroup) {
            let jumpHeight = 0;
            const jumpInt = setInterval(() => {
                jumpHeight += 0.2; petGroup.position.y = Math.sin(jumpHeight) * 1.5;
                if (jumpHeight > Math.PI) { clearInterval(jumpInt); petGroup.position.y = 0; }
            }, 50);
        }
    }
}

window.changeRoom = (roomName) => {
    if (roomName === 'work') { doWork(); return; }
    STATE.currentRoom = roomName;
    buildRoom();
    showNotification(`Entered ${roomName}`, "info");
};

function doWork() {
    if (STATE.stats.energy < 20) { showNotification("Too tired to work!", "warning"); return; }
    if (STATE.stats.happiness < 10) { showNotification("Too depressed to work...", "error"); return; }
    STATE.money += CONFIG.salary;
    STATE.stats.energy -= 15; STATE.stats.hunger -= 10; STATE.stats.happiness -= 10;
    updateUI(); showNotification(`Worked hard! Earned $${CONFIG.salary}. Happiness -10`, "success");
}

window.closeModal = (id) => document.getElementById(id).classList.add('hidden');
window.buyItem = (item, cost) => {
    if (STATE.money >= cost) {
        STATE.money -= cost;
        if (item === 'kibble') {
            STATE.inventory.food = (STATE.inventory.food || 0) + 1;
            showNotification(`Bought Kibble! Stock: ${STATE.inventory.food}`, "success");
        } else if (item === 'ball') {
            if (!STATE.inventory.toys.includes('ball')) {
                STATE.inventory.toys.push('ball');
                showNotification("Bought Bouncy Ball! Check Living Room.", "success");
                if (STATE.currentRoom === 'livingroom') buildRoom();
            } else { STATE.money += cost; showNotification("You already have this toy!", "warning"); }
        }
        updateUI(); updateFridgeUI();
    } else { showNotification("Not enough money!", "error"); }
};
window.consumeItem = (type) => {
    if (type === 'food') {
        if (STATE.inventory.food > 0) {
            STATE.inventory.food--; STATE.stats.hunger = Math.min(100, STATE.stats.hunger + 40); STATE.stats.happiness = Math.min(100, STATE.stats.happiness + 5);
            showNotification("Yum! Hunger -40, Happiness +5", "success");
        } else { showNotification("No food in fridge!", "error"); }
    }
    updateUI(); updateFridgeUI();
};
function updateFridgeUI() { document.getElementById('stock-food').innerText = STATE.inventory.food || 0; }
window.depositSavings = () => {
    const el = document.getElementById('deposit-amount'); const amount = parseInt(el.value);
    if (amount > 0 && STATE.money >= amount) {
        STATE.money -= amount; STATE.savings += amount;
        if (STATE.savings >= CONFIG.savingsGoal && !STATE.inventory.hatUnlocked) {
            STATE.inventory.hatUnlocked = true; buildPet(); showNotification("GOAL REACHED! Hat unlocked!", "success");
        }
        updateUI(); el.value = '';
    }
};

let indicatorTimeout;
function showActionIndicator(text) {
    const el = document.getElementById('action-indicator'); const txt = document.getElementById('action-text');
    if (el && txt) {
        txt.innerText = text; el.classList.remove('hidden');
        if (indicatorTimeout) clearTimeout(indicatorTimeout);
        indicatorTimeout = setTimeout(() => { el.classList.add('hidden'); }, 1500);
    }
}
function updateTaskSidebar() {
    const list = document.getElementById('task-list-content'); if (!list) return;
    list.innerHTML = '';
    const renderItem = (label, current, max, isHere) => {
        const percent = Math.min(100, (current / max) * 100);
        const isDone = current >= max;
        const opacity = isHere ? 'opacity-100' : 'opacity-40 grayscale';
        const div = document.createElement('div');
        div.className = `p-3 rounded-lg bg-slate-800/80 border border-slate-700 ${opacity} transition-all`;
        div.innerHTML = `<div class="flex justify-between text-xs text-slate-300 mb-1"><span class="font-bold ${isDone ? 'text-green-400 line-through' : 'text-slate-100'}">${label}</span><span>${current}/${max}</span></div><div class="w-full bg-slate-900 h-2 rounded-full overflow-hidden"><div class="bg-gradient-to-r from-teal-500 to-emerald-400 h-full transition-all duration-500" style="width: ${percent}%"></div></div>`;
        return div;
    };
    const entries = [];
    Object.keys(CHORE_CONFIG).forEach(key => {
        const cfg = CHORE_CONFIG[key];
        const relevantRooms = Array.isArray(cfg.room) ? cfg.room : [cfg.room];
        relevantRooms.forEach(r => {
            const uniqueId = cfg.global ? `${key}_${r}` : key;
            const progress = (STATE.chores.progress[uniqueId] || []).length;
            entries.push({ label: `${cfg.name} (${r})`, current: progress, max: cfg.count, room: r });
        });
    });
    entries.sort((a, b) => {
        if (a.room === STATE.currentRoom && b.room !== STATE.currentRoom) return -1;
        if (a.room !== STATE.currentRoom && b.room === STATE.currentRoom) return 1;
        return 0;
    });
    entries.forEach(e => list.appendChild(renderItem(e.label, e.current, e.max, e.room === STATE.currentRoom)));
}

function spawnMoneyParticles(pos) {
    if (!scene || !camera) return;
    const particle = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ color: 0x4ade80, side: THREE.DoubleSide, transparent: true }));
    particle.position.copy(pos); particle.lookAt(camera.position); scene.add(particle);
    let frame = 0;
    const anim = setInterval(() => {
        particle.position.y += 0.05; particle.scale.setScalar(1 + Math.sin(frame * 0.2) * 0.2); particle.material.opacity = Math.max(0, 1 - (frame / 30));
        frame++; if (frame > 30) { clearInterval(anim); if (particle.parent) scene.remove(particle); }
    }, 30);
}

function showNotification(msg, type = 'info') {
    const container = document.getElementById('notification-area'); if (!container) return;
    const toast = document.createElement('div');
    let colors = "bg-slate-800 border-slate-600";
    if (type === 'success') colors = "bg-green-900/80 border-green-500";
    if (type === 'error') colors = "bg-red-900/80 border-red-500";
    if (type === 'warning') colors = "bg-yellow-900/80 border-yellow-500";
    toast.className = `p-3 rounded-lg border text-white text-sm shadow-lg mb-2 w-full toast-enter ${colors}`;
    toast.innerText = msg;
    container.appendChild(toast);
    requestAnimationFrame(() => { toast.classList.remove('toast-enter'); toast.classList.add('toast-enter-active'); });
    setTimeout(() => { toast.classList.remove('toast-enter-active'); toast.classList.add('toast-exit-active'); setTimeout(() => toast.remove(), 300); }, 3000);
}

function animate() {
    if (petGroup) { petGroup.rotation.y += 0.01; }
    renderer.render(scene, camera);
}
