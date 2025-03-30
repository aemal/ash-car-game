// Three.js setup
let scene, camera, renderer, car, environment;
let controls;
let selectedCarType = null;
let previewScenes = [];
let previewCameras = [];
let previewRenderers = [];
let carModels = {};
let buildings = []; // Store building references
let trees = []; // Store tree references
let isGameOver = false;
let fireParticles = null;
let countdownMesh = null;

// Sound variables
let sounds = {
    engine: new Audio('sounds/engine.mp3'),
    collision: new Audio('sounds/collision.mp3'),
    gear: new Audio('sounds/gear.mp3')
};

// Add lastGear variable back
let lastGear = 'N';

// Sound manager
const soundManager = {
    init() {
        console.log('🎵 Initializing sound manager...');
        
        // Set up engine sound
        sounds.engine.loop = true;
        sounds.engine.volume = 0.3;
        
        // Set up other sounds
        sounds.collision.volume = 0.5;
        sounds.gear.volume = 0.3;
        
        // Add error handlers
        Object.keys(sounds).forEach(key => {
            sounds[key].onerror = (e) => {
                console.error(`❌ Error loading sound ${key}:`, e);
            };
            sounds[key].oncanplaythrough = () => {
                console.log(`✅ Sound loaded: ${key}`);
            };
        });

        // Add click handler to start audio
        document.addEventListener('click', () => {
            if (sounds.engine.paused) {
                sounds.engine.play().catch(e => console.log('Waiting for game to start'));
            }
        }, { once: true });
    },

    playSound(name, volume = 1) {
        if (!sounds[name]) {
            console.error(`❌ Sound not found: ${name}`);
            return;
        }
        
        try {
            const sound = sounds[name];
            sound.currentTime = 0;
            sound.volume = volume;
            sound.play().catch(error => {
                console.error(`❌ Error playing sound ${name}:`, error);
            });
            console.log(`🎵 Playing sound: ${name} (volume: ${volume})`);
        } catch (error) {
            console.error(`❌ Error playing sound ${name}:`, error);
        }
    },

    updateEngineSound(speed, gear) {
        if (!sounds.engine) return;

        const speedRatio = Math.abs(speed / maxSpeed);
        const volume = 0.1 + speedRatio * 0.4; // Base volume of 0.1, max 0.5
        
        try {
            if (sounds.engine.paused && isGameStarted) {
                sounds.engine.play().catch(error => {
                    console.error('❌ Error starting engine sound:', error);
                });
            }
            
            sounds.engine.volume = volume;
            
            if (gear !== lastGear) {
                this.playSound('gear', 0.3);
                lastGear = gear;
            }
        } catch (error) {
            console.error('❌ Error updating engine sound:', error);
        }
    }
};

let loadingManager = new THREE.LoadingManager(
    // onLoad
    () => {
        console.log('✅ All models loaded successfully!');
        document.querySelector('.loading-message').classList.remove('visible');
    },
    // onProgress
    (url, itemsLoaded, itemsTotal) => {
        console.log(`🔄 Loading file: ${url}`);
        console.log(`Progress: ${itemsLoaded} / ${itemsTotal}`);
        document.querySelector('.loading-message').textContent = 
            `Loading 3D models... (${itemsLoaded}/${itemsTotal})`;
    },
    // onError
    (url) => {
        console.error('❌ Error loading:', url);
    }
);

// Car physics variables
let speed = 0;
let acceleration = 0;
let steering = 0;
let gear = 'N';
let rpm = 0;
let handbrake = false;
let cameraMode = 'third';
let maxSpeed = 120;
let currentSpeedKmh = 0;
let cameraAngle = 0;
let turnAngle = 0; // Track the car's turn angle
let accelerationRate = 0.5; // Base acceleration
let maxAcceleration = 0.5;
let turnSpeed = 0.03; // Base turn speed
let driftFactor = 0.98; // How much the car maintains its previous direction

// Game state
let keys = {};
let isGameStarted = false;

// Initialize the game
function init() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky blue background

    // Create camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, 0);

    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.getElementById('gameCanvas').appendChild(renderer.domElement);

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Create environment
    createEnvironment();

    // Event listeners
    window.addEventListener('resize', onWindowResize, false);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // Show loading message
    document.querySelector('.loading-message').classList.add('visible');

    // Initialize sound system
    soundManager.init();

    // Initialize car selection
    initCarSelection();

    // Start animation loop
    animate();
}

// Create the environment (streets, buildings, etc.)
function createEnvironment() {
    // Create ground with green base
    const groundGeometry = new THREE.PlaneGeometry(1000, 1000);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x2d5a27, // Changed from gray (0x333333) to dark green
        roughness: 1,
        metalness: 0
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.2; // Slightly lower to prevent z-fighting
    ground.receiveShadow = true;
    scene.add(ground);

    // Create multiple grass patches with varying colors
    const grassColors = [
        0x2d5a27,  // Dark green
        0x3a6b33,  // Medium green
        0x4a7b43,  // Light green
        0x5a8b53,  // Very light green
        0x2d6a27,  // Alternative dark green
        0x3d7a33,  // Alternative medium green
        0x355e2b,  // Forest green
        0x446b32,  // Moss green
        0x2d4a27,  // Deep forest green
        0x3d5a33,  // Rich green
        0x4d6a3f   // Bright green
    ];

    // Create multiple base grass layers for more variation
    for (let i = 0; i < 5; i++) { // Increased from 3 to 5 layers
        const grassGeometry = new THREE.PlaneGeometry(1000, 1000);
        const grassMaterial = new THREE.MeshStandardMaterial({ 
            color: grassColors[i % grassColors.length],
            roughness: 1,
            metalness: 0,
            opacity: 0.8,
            transparent: true
        });
        const grass = new THREE.Mesh(grassGeometry, grassMaterial);
        grass.rotation.x = -Math.PI / 2;
        grass.position.y = -0.15 - (i * 0.001); // Slightly different heights
        grass.receiveShadow = true;
        scene.add(grass);
    }

    // Add massive amount of grass patches for ultra-dense coverage
    const patchSizes = [20, 30, 40, 50, 75]; // More varied sizes, emphasis on smaller patches
    const numPatches = 1000; // Dramatically increased from 400 to 1000
    for (let i = 0; i < numPatches; i++) {
        const patchSize = patchSizes[Math.floor(Math.random() * patchSizes.length)];
        const patchGeometry = new THREE.PlaneGeometry(patchSize, patchSize);
        const patchMaterial = new THREE.MeshStandardMaterial({
            color: grassColors[Math.floor(Math.random() * grassColors.length)],
            roughness: 1,
            metalness: 0
        });
        const patch = new THREE.Mesh(patchGeometry, patchMaterial);
        patch.rotation.x = -Math.PI / 2;
        // Spread patches more evenly across the entire area
        patch.position.set(
            -485 + Math.random() * 970,
            -0.14 + Math.random() * 0.04, // More height variation
            -485 + Math.random() * 970
        );
        patch.rotation.z = Math.random() * Math.PI * 2;
        patch.receiveShadow = true;
        scene.add(patch);
    }

    // Add huge number of tiny detail patches for rich texture
    const numDetailPatches = 2000; // Dramatically increased from 600 to 2000
    for (let i = 0; i < numDetailPatches; i++) {
        const patchSize = 5 + Math.random() * 10; // Random sizes between 5 and 15
        const patchGeometry = new THREE.PlaneGeometry(patchSize, patchSize);
        const patchMaterial = new THREE.MeshStandardMaterial({
            color: grassColors[Math.floor(Math.random() * grassColors.length)],
            roughness: 1,
            metalness: 0
        });
        const patch = new THREE.Mesh(patchGeometry, patchMaterial);
        patch.rotation.x = -Math.PI / 2;
        patch.position.set(
            -490 + Math.random() * 980,
            -0.13 + Math.random() * 0.04, // More height variation
            -490 + Math.random() * 980
        );
        patch.rotation.z = Math.random() * Math.PI * 2;
        patch.receiveShadow = true;
        scene.add(patch);
    }

    // Add grass clumps for extra detail
    const numGrassClumps = 1500; // Add lots of grass clumps
    for (let i = 0; i < numGrassClumps; i++) {
        const clumpGeometry = new THREE.PlaneGeometry(3, 3);
        const clumpMaterial = new THREE.MeshStandardMaterial({
            color: grassColors[Math.floor(Math.random() * grassColors.length)],
            roughness: 1,
            metalness: 0
        });
        const clump = new THREE.Mesh(clumpGeometry, clumpMaterial);
        clump.rotation.x = -Math.PI / 2;
        clump.position.set(
            -495 + Math.random() * 990,
            -0.12 + Math.random() * 0.05, // Even more height variation
            -495 + Math.random() * 990
        );
        clump.rotation.z = Math.random() * Math.PI * 2;
        clump.receiveShadow = true;
        scene.add(clump);
    }

    // Create streets with narrower roads
    createStreets();

    // Create buildings
    createBuildings();

    // Add more trees
    createTrees();
}

// Create street network
function createStreets() {
    // Street materials
    const streetMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x333333,  // Dark gray for asphalt
        roughness: 0.9,
        metalness: 0.1
    });

    const sidewalkMaterial = new THREE.MeshStandardMaterial({
        color: 0x777777,  // Lighter gray for sidewalks
        roughness: 0.8,
        metalness: 0.1
    });

    // Main roads - drastically reduced width
    const mainRoadWidth = 8;  // Further reduced from 10 to 8
    const mainRoad = new THREE.Mesh(
        new THREE.PlaneGeometry(mainRoadWidth, 1000),
        streetMaterial
    );
    mainRoad.rotation.x = -Math.PI / 2;
    mainRoad.position.y = 0.01; // Slightly raised to prevent z-fighting
    mainRoad.receiveShadow = true;
    scene.add(mainRoad);

    // Sidewalks along main road - minimal width
    const sidewalkWidth = 1; // Further reduced from 1.5 to 1
    const leftSidewalk = new THREE.Mesh(
        new THREE.PlaneGeometry(sidewalkWidth, 1000),
        sidewalkMaterial
    );
    leftSidewalk.rotation.x = -Math.PI / 2;
    leftSidewalk.position.set(-mainRoadWidth/2 - sidewalkWidth/2, 0.02, 0);
    leftSidewalk.receiveShadow = true;
    scene.add(leftSidewalk);

    const rightSidewalk = leftSidewalk.clone();
    rightSidewalk.position.x = mainRoadWidth/2 + sidewalkWidth/2;
    scene.add(rightSidewalk);

    // Cross streets with sidewalks - spaced much further apart
    for (let i = -400; i <= 400; i += 500) {
        // Street - narrower cross streets
        const crossStreet = new THREE.Mesh(
            new THREE.PlaneGeometry(1000, mainRoadWidth),
            streetMaterial
        );
        crossStreet.rotation.x = -Math.PI / 2;
        crossStreet.position.set(0, 0.01, i);
        crossStreet.receiveShadow = true;
        scene.add(crossStreet);

        // Sidewalks for cross streets
        const crossSidewalkLeft = new THREE.Mesh(
            new THREE.PlaneGeometry(1000, sidewalkWidth),
            sidewalkMaterial
        );
        crossSidewalkLeft.rotation.x = -Math.PI / 2;
        crossSidewalkLeft.position.set(0, 0.02, i - mainRoadWidth/2 - sidewalkWidth/2);
        crossSidewalkLeft.receiveShadow = true;
        scene.add(crossSidewalkLeft);

        const crossSidewalkRight = crossSidewalkLeft.clone();
        crossSidewalkRight.position.z = i + mainRoadWidth/2 + sidewalkWidth/2;
        scene.add(crossSidewalkRight);

        // Add grass strips along cross streets
        const grassStripMaterial = new THREE.MeshStandardMaterial({
            color: 0x2d5a27,
            roughness: 1,
            metalness: 0
        });

        // Add larger grass patches in corners
        const cornerSize = 100; // Increased from 80 to 100
        const cornerGrass = new THREE.Mesh(
            new THREE.PlaneGeometry(cornerSize, cornerSize),
            grassStripMaterial
        );
        cornerGrass.rotation.x = -Math.PI / 2;
        cornerGrass.position.y = -0.05;

        // Add corners at intersection with larger size
        const corners = [
            { x: -mainRoadWidth/2 - cornerSize/2, z: i - mainRoadWidth/2 - cornerSize/2 },
            { x: mainRoadWidth/2 + cornerSize/2, z: i - mainRoadWidth/2 - cornerSize/2 },
            { x: -mainRoadWidth/2 - cornerSize/2, z: i + mainRoadWidth/2 + cornerSize/2 },
            { x: mainRoadWidth/2 + cornerSize/2, z: i + mainRoadWidth/2 + cornerSize/2 }
        ];

        corners.forEach(pos => {
            const corner = cornerGrass.clone();
            corner.position.x = pos.x;
            corner.position.z = pos.z;
            scene.add(corner);
        });

        // Add additional grass patches between intersections
        if (i < 400) {
            const midPoint = (i + 500) / 2;
            const grassPatchSize = 150; // Increased size for more coverage
            const midGrassPatch = new THREE.Mesh(
                new THREE.PlaneGeometry(grassPatchSize, grassPatchSize),
                grassStripMaterial
            );
            midGrassPatch.rotation.x = -Math.PI / 2;
            midGrassPatch.position.y = -0.05;

            [-1, 1].forEach(xMult => {
                const patch = midGrassPatch.clone();
                patch.position.set(
                    xMult * (mainRoadWidth/2 + grassPatchSize/2),
                    -0.05,
                    midPoint
                );
                scene.add(patch);
            });
        }
    }

    createStreetLines(mainRoadWidth);
}

// Create street lines
function createStreetLines(roadWidth) {
    const lineMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 0.5
    });

    // Center lines on main road (double yellow lines)
    for (let i = -500; i < 500; i += 4) {
        // Left yellow line
        const leftLine = new THREE.Mesh(
            new THREE.PlaneGeometry(0.3, 2),
            new THREE.MeshStandardMaterial({ color: 0xffff00 })
        );
        leftLine.rotation.x = -Math.PI / 2;
        leftLine.position.set(-0.8, 0.1, i);
        scene.add(leftLine);

        // Right yellow line
        const rightLine = leftLine.clone();
        rightLine.position.x = 0.8;
        scene.add(rightLine);

        // White lane dividers
        const leftLaneLine = new THREE.Mesh(
            new THREE.PlaneGeometry(0.2, 2),
            lineMaterial
        );
        leftLaneLine.rotation.x = -Math.PI / 2;
        leftLaneLine.position.set(-roadWidth/4, 0.1, i);
        scene.add(leftLaneLine);

        const rightLaneLine = leftLaneLine.clone();
        rightLaneLine.position.x = roadWidth/4;
        scene.add(rightLaneLine);
    }

    // Cross street lines
    for (let i = -500; i < 500; i += 4) {
        const line = new THREE.Mesh(
            new THREE.PlaneGeometry(2, 0.2),
            lineMaterial
        );
        line.rotation.x = -Math.PI / 2;
        line.position.set(i, 0.1, 0);
        scene.add(line);
    }
}

// Create buildings
function createBuildings() {
    const buildingColors = [
        0xcc8866,  // Brick red
        0x99aa77,  // Olive
        0x6677aa,  // Steel blue
        0x888888,  // Gray
        0xddbb99   // Tan
    ];

    // Define city blocks (areas where buildings can be placed)
    const blockSize = 180;  // Size of each city block
    const streetWidth = 40;  // Total width of street + sidewalks
    const safeDistance = 30; // Minimum distance from streets
    
    for (let x = -400; x <= 400; x += blockSize + streetWidth) {
        for (let z = -400; z <= 400; z += blockSize + streetWidth) {
            // Skip if this block is too close to main roads
            if (Math.abs(x) < streetWidth * 2 || Math.abs(z) < streetWidth * 2) continue;
            
            // Create 3-5 buildings per block
            const buildingsInBlock = Math.floor(Math.random() * 3) + 3;
            
            for (let b = 0; b < buildingsInBlock; b++) {
                const height = Math.random() * 30 + 15;  // 15-45 units tall
                const width = Math.random() * 20 + 15;   // 15-35 units wide
                const depth = Math.random() * 20 + 15;   // 15-35 units deep
                
                // Position within block, keeping larger margin from streets
                const margin = safeDistance;
                const xPos = x + Math.random() * (blockSize - width - margin * 2) + margin - blockSize/2;
                const zPos = z + Math.random() * (blockSize - depth - margin * 2) + margin - blockSize/2;
                
                // Skip if too close to streets
                if (Math.abs(xPos) < streetWidth * 2 || Math.abs(zPos) < streetWidth * 2) continue;
                
                // Create building
                const building = new THREE.Group();
                
                // Main building structure
                const buildingGeometry = new THREE.BoxGeometry(width, height, depth);
                const buildingMaterial = new THREE.MeshStandardMaterial({ 
                    color: buildingColors[Math.floor(Math.random() * buildingColors.length)],
                    roughness: 0.7,
                    metalness: 0.2
                });
                
                const buildingMesh = new THREE.Mesh(buildingGeometry, buildingMaterial);
                buildingMesh.position.set(0, height/2, 0);
                building.add(buildingMesh);
                
                // Add windows
                const windowMaterial = new THREE.MeshStandardMaterial({
                    color: 0x88ccff,
                    emissive: 0x88ccff,
                    emissiveIntensity: 0.2
                });
                
                // Create window rows
                const windowSize = 1;
                const windowSpacing = 3;
                const windowRows = Math.floor(height / windowSpacing) - 2;
                const windowCols = Math.floor(width / windowSpacing) - 1;
                
                for (let row = 1; row < windowRows; row++) {
                    for (let col = 0; col < windowCols; col++) {
                        const window = new THREE.Mesh(
                            new THREE.PlaneGeometry(windowSize, windowSize),
                            windowMaterial
                        );
                        window.position.set(
                            -width/2 + col * windowSpacing + windowSpacing,
                            row * windowSpacing,
                            depth/2 + 0.1
                        );
                        building.add(window);
                        
                        const windowBack = window.clone();
                        windowBack.position.z = -depth/2 - 0.1;
                        windowBack.rotation.y = Math.PI;
                        building.add(windowBack);
                        
                        if (col === 0) {
                            const windowLeft = window.clone();
                            windowLeft.position.set(
                                -width/2 - 0.1,
                                row * windowSpacing,
                                -depth/2 + col * windowSpacing + windowSpacing
                            );
                            windowLeft.rotation.y = -Math.PI/2;
                            building.add(windowLeft);
                            
                            const windowRight = window.clone();
                            windowRight.position.set(
                                width/2 + 0.1,
                                row * windowSpacing,
                                -depth/2 + col * windowSpacing + windowSpacing
                            );
                            windowRight.rotation.y = Math.PI/2;
                            building.add(windowRight);
                        }
                    }
                }
                
                building.position.set(xPos, 0, zPos);
                building.castShadow = true;
                building.receiveShadow = true;
                scene.add(building);
                
                const boundingBox = new THREE.Box3().setFromObject(building);
                buildings.push({ mesh: building, bounds: boundingBox });
            }
        }
    }
}

// Initialize car selection
function initCarSelection() {
    console.log('🚗 Initializing car selection...');
    const loader = new THREE.GLTFLoader(loadingManager);
    const carTypes = ['sports', 'muscle', 'classic'];
    let loadedModels = 0;

    // Create preview scenes for each car
    carTypes.forEach(type => {
        console.log(`🎨 Setting up preview scene for ${type} car`);
        const previewScene = new THREE.Scene();
        const previewCamera = new THREE.PerspectiveCamera(75, 300 / 200, 0.1, 1000);
        const previewRenderer = new THREE.WebGLRenderer({ antialias: true });
        
        previewRenderer.setSize(300, 200);
        document.getElementById(`${type}CarPreview`).appendChild(previewRenderer.domElement);
        
        // Add lighting to preview
        const light = new THREE.DirectionalLight(0xffffff, 0.8);
        light.position.set(5, 5, 5);
        previewScene.add(light);
        previewScene.add(new THREE.AmbientLight(0xffffff, 0.6));
        
        previewCamera.position.set(0, 2, 5);
        previewCamera.lookAt(0, 0, 0);
        
        previewScenes.push(previewScene);
        previewCameras.push(previewCamera);
        previewRenderers.push(previewRenderer);

        // Load car model
        console.log(`📥 Loading ${type} car model...`);
        loader.load(
            `models/${type}_car.glb`,
            (gltf) => {
                console.log(`✨ ${type} car model loaded successfully`);
                const model = gltf.scene;
                model.scale.set(0.5, 0.5, 0.5);
                model.position.set(0, 0, 0);
                model.rotation.y = Math.PI;
                previewScene.add(model);
                carModels[type] = model;
                loadedModels++;
            },
            (progress) => {
                const percentComplete = (progress.loaded / progress.total) * 100;
                console.log(`${type} car: ${Math.round(percentComplete)}% loaded`);
            },
            (error) => {
                console.error(`❌ Error loading ${type} car model:`, error);
                console.log(`⚠️ Using fallback basic car for ${type}`);
                const basicCar = createBasicCar(type);
                previewScene.add(basicCar);
                carModels[type] = basicCar;
                loadedModels++;
            }
        );
    });

    // Add click handlers for car selection
    document.querySelectorAll('.car-option').forEach(option => {
        option.addEventListener('click', () => {
            document.querySelectorAll('.car-option').forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
            selectedCarType = option.dataset.car;
        });
    });

    // Start preview animations
    animatePreviews();
}

// Create a basic car as fallback
function createBasicCar(type) {
    const carGroup = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 0.5, 2);
    const material = new THREE.MeshStandardMaterial({ 
        color: type === 'sports' ? 0xff0000 : 
               type === 'muscle' ? 0x0000ff : 0x00ff00 
    });
    const car = new THREE.Mesh(geometry, material);
    car.castShadow = true;
    carGroup.add(car);
    return carGroup;
}

// Start game with selected car
async function startGame() {
    if (!selectedCarType) {
        alert('Please select a car first!');
        return;
    }

    // Hide car selection menu
    document.querySelector('.car-selection-menu').style.display = 'none';
    document.querySelector('.game-container').style.display = 'block';

    // Clone the selected car model
    car = carModels[selectedCarType].clone();
    car.position.set(0, 0.5, 0);
    scene.add(car);

    // Start engine sound
    try {
        await sounds.engine.play();
        console.log('🎵 Engine sound started');
    } catch (error) {
        console.error('❌ Error starting engine sound:', error);
    }

    isGameStarted = true;

    // Start game loop
    animate();
}

// Handle key events
function onKeyDown(event) {
    keys[event.key] = true;
    if (event.key === 'Enter' && !isGameStarted) {
        startGame();
    }
    if (event.key.toLowerCase() === 'c') {
        cameraMode = cameraMode === 'first' ? 'third' : 'first';
    }
    if (event.key.toLowerCase() === 'r') {
        resetCarPosition();
    }
}

function onKeyUp(event) {
    keys[event.key] = false;
}

// Create fire effect
function createFireEffect(position) {
    const particleCount = 100;
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];

    for (let i = 0; i < particleCount; i++) {
        positions.push(
            position.x + (Math.random() - 0.5) * 2,
            position.y + Math.random() * 2,
            position.z + (Math.random() - 0.5) * 2
        );
        colors.push(
            1,  // R
            Math.random() * 0.5,  // G
            0   // B
        );
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
        size: 0.5,
        vertexColors: true,
        transparent: true,
        opacity: 0.8
    });

    fireParticles = new THREE.Points(geometry, material);
    scene.add(fireParticles);
}

// Update fire effect
function updateFireEffect() {
    if (!fireParticles) return;

    const positions = fireParticles.geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
        positions[i + 1] += 0.1; // Move particles up
        if (positions[i + 1] > car.position.y + 4) {
            positions[i + 1] = car.position.y; // Reset particle to bottom
        }
    }
    fireParticles.geometry.attributes.position.needsUpdate = true;
}

// Create countdown text
function createCountdownText(number) {
    if (countdownMesh) scene.remove(countdownMesh);
    
    const loader = new THREE.FontLoader();
    loader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', function(font) {
        const geometry = new THREE.TextGeometry(number.toString(), {
            font: font,
            size: 5,
            height: 0.5
        });
        
        const material = new THREE.MeshPhongMaterial({ color: 0xff0000 });
        countdownMesh = new THREE.Mesh(geometry, material);
        
        // Position in front of camera
        geometry.computeBoundingBox();
        const textWidth = geometry.boundingBox.max.x - geometry.boundingBox.min.x;
        countdownMesh.position.set(
            camera.position.x - textWidth / 2,
            camera.position.y,
            camera.position.z - 10
        );
        
        scene.add(countdownMesh);
    });
}

// Handle collision and restart
function handleCollision() {
    isGameOver = true;
    createFireEffect(car.position);
    
    // Play collision sound
    soundManager.playSound('collision', 0.5);
    
    // Stop engine sound
    sounds.engine.pause();
    sounds.engine.currentTime = 0;
    
    // Start countdown animation
    let count = 3;
    createCountdownText(count);
    
    const countdownInterval = setInterval(() => {
        count--;
        if (count > 0) {
            createCountdownText(count);
        } else {
            clearInterval(countdownInterval);
            resetGame();
        }
    }, 1000);
}

// Check for collisions
function checkCollisions() {
    if (isGameOver) return;

    const carBox = new THREE.Box3().setFromObject(car);
    
    // Check building collisions
    for (const building of buildings) {
        if (carBox.intersectsBox(building.bounds)) {
            handleCollision();
            return;
        }
    }
    
    // Check tree collisions
    for (const tree of trees) {
        // Update tree bounding box (in case tree moved/rotated)
        tree.bounds.setFromObject(tree.mesh);
        if (carBox.intersectsBox(tree.bounds)) {
            handleCollision();
            return;
        }
    }
}

// Reset game
function resetGame() {
    // Remove fire effect
    if (fireParticles) {
        scene.remove(fireParticles);
        fireParticles = null;
    }
    
    // Remove countdown text
    if (countdownMesh) {
        scene.remove(countdownMesh);
        countdownMesh = null;
    }
    
    // Reset car position and physics
    resetCarPosition();
    
    // Restart engine sound
    try {
        sounds.engine.play();
        console.log('🎵 Engine sound restarted');
    } catch (error) {
        console.error('❌ Error restarting engine sound:', error);
    }
    
    // Reset game state
    isGameOver = false;
    
    // Clear trees array before recreating environment
    trees = [];
}

// Update car physics
function updateCarPhysics() {
    if (!car || isGameOver) return;

    const deltaTime = 1/60;
    
    // Handle acceleration
    if (keys['ArrowUp']) {
        acceleration = Math.min(acceleration + accelerationRate * deltaTime, maxAcceleration);
        gear = 'D';
    } else if (keys['ArrowDown']) {
        acceleration = Math.max(acceleration - accelerationRate * deltaTime, -maxAcceleration * 0.6);
        gear = 'R';
    } else {
        acceleration *= 0.95;
        if (Math.abs(acceleration) < 0.01) {
            acceleration = 0;
            gear = 'N';
        }
    }

    // Update speed with momentum
    speed += acceleration;
    
    // Apply more realistic friction based on speed
    const friction = Math.abs(speed) * 0.02;
    speed *= (1 - friction);

    // Handle steering with speed-based sensitivity
    const speedFactor = Math.min(Math.abs(speed) / maxSpeed, 1);
    const currentTurnSpeed = turnSpeed * (1 + speedFactor);

    if (keys['ArrowLeft']) {
        turnAngle += currentTurnSpeed * (1 - speedFactor * 0.5);
    } else if (keys['ArrowRight']) {
        turnAngle -= currentTurnSpeed * (1 - speedFactor * 0.5);
    } else {
        // Return wheels to center gradually
        turnAngle *= 0.95;
    }

    // Limit turn angle
    turnAngle = Math.max(Math.min(turnAngle, Math.PI / 3), -Math.PI / 3);

    // Update camera angle with drift effect
    cameraAngle = cameraAngle * driftFactor + turnAngle * (1 - driftFactor);

    // Convert speed to km/h for display
    currentSpeedKmh = Math.abs(speed) * 60;

    // Clamp speed
    if (currentSpeedKmh > maxSpeed) {
        speed *= maxSpeed / currentSpeedKmh;
        currentSpeedKmh = maxSpeed;
    }

    // Update engine sound
    soundManager.updateEngineSound(currentSpeedKmh, gear);

    // Calculate movement direction based on camera angle
    const moveAngle = cameraAngle;
    
    // Update car position with improved physics
    const moveSpeed = speed * (1 + currentSpeedKmh / maxSpeed * 0.2);
    car.position.x += Math.sin(moveAngle) * moveSpeed;
    car.position.z += Math.cos(moveAngle) * moveSpeed;
    car.position.y = 0.5;
    
    // Rotate car model
    car.rotation.y = moveAngle;

    // Update HUD
    document.getElementById('speedValue').textContent = Math.round(currentSpeedKmh);
    document.getElementById('gearValue').textContent = gear;

    // Check for collisions
    checkCollisions();
}

// Update camera position
function updateCamera() {
    if (!car) return;

    const idealOffset = new THREE.Vector3();
    const idealLookat = new THREE.Vector3();
    
    if (cameraMode === 'third') {
        // Adjust camera distance based on speed
        const baseDistance = 7;
        const speedBonus = (currentSpeedKmh / maxSpeed) * 3;
        const distance = baseDistance + speedBonus;
        const height = 3 + speedBonus * 0.5;
        
        // Calculate camera position with smooth follow
        idealOffset.set(
            car.position.x - Math.sin(cameraAngle) * distance,
            car.position.y + height,
            car.position.z - Math.cos(cameraAngle) * distance
        );
        
        // Look ahead of the car
        const lookAheadDistance = 5 + (currentSpeedKmh / maxSpeed) * 5;
        idealLookat.set(
            car.position.x + Math.sin(cameraAngle) * lookAheadDistance,
            car.position.y + 1,
            car.position.z + Math.cos(cameraAngle) * lookAheadDistance
        );
        
        // Smooth camera movement
        camera.position.lerp(idealOffset, 0.1);
        
        // Update camera target
        const currentTarget = new THREE.Vector3();
        camera.getWorldDirection(currentTarget);
        const targetPosition = new THREE.Vector3().copy(idealLookat);
        camera.lookAt(targetPosition);
        
    } else {
        // First person view
        const height = 1.5;
        const distance = 0.5;
        
        camera.position.set(
            car.position.x + Math.sin(cameraAngle) * distance,
            car.position.y + height,
            car.position.z + Math.cos(cameraAngle) * distance
        );
        
        camera.lookAt(
            car.position.x + Math.sin(cameraAngle) * 10,
            car.position.y + height,
            car.position.z + Math.cos(cameraAngle) * 10
        );
    }
}

// Reset car position
function resetCarPosition() {
    if (car) {
        car.position.set(0, 0.5, 0);
        car.rotation.y = 0;
        speed = 0;
        acceleration = 0;
        accelerationRate = 0.8;
        cameraAngle = 0;
        turnAngle = 0;
        gear = 'N';
    }
}

// Handle window resize
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    if (isGameStarted) {
        updateCarPhysics();
        updateCamera();
        if (fireParticles) {
            updateFireEffect();
        }
    }
    
    // Render the scene
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

// Modify createTrees function to keep trees away from streets
function createTrees() {
    // Tree creation helper function
    function createTree(x, z, scale = 1) {
        const tree = new THREE.Group();
        
        // Create trunk with varying colors
        const trunkColors = [
            0x4a2f21,  // Dark brown
            0x5a3f31,  // Medium brown
            0x6a4f41   // Light brown
        ];
        
        const trunkGeometry = new THREE.CylinderGeometry(0.2 * scale, 0.3 * scale, 1.5 * scale, 8);
        const trunkMaterial = new THREE.MeshStandardMaterial({
            color: trunkColors[Math.floor(Math.random() * trunkColors.length)],
            roughness: 0.9,
            metalness: 0.1
        });
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.castShadow = true;
        trunk.receiveShadow = true;
        trunk.position.y = 0.75 * scale;
        tree.add(trunk);

        // Create foliage with varying colors
        const foliageColors = [
            0x0f5f13,  // Dark green
            0x1f6f23,  // Medium green
            0x2f7f33,  // Light green
            0x3f8f43   // Very light green
        ];

        const foliageMaterial = new THREE.MeshStandardMaterial({
            color: foliageColors[Math.floor(Math.random() * foliageColors.length)],
            roughness: 1,
            metalness: 0
        });

        if (Math.random() < 0.3) { // 30% chance for pine trees
            // Create pine-like tree
            for (let i = 0; i < 4; i++) { // Added one more layer
                const pineGeometry = new THREE.ConeGeometry(1.2 * scale * (1 - i * 0.2), 2 * scale, 8);
                const pine = new THREE.Mesh(pineGeometry, foliageMaterial);
                pine.position.y = 2 * scale + i * 1.2 * scale;
                pine.castShadow = true;
                pine.receiveShadow = true;
                tree.add(pine);
            }
        } else {
            // Create normal tree with multiple layers
            for (let i = 0; i < 3; i++) {
                const size = 2 - i * 0.4;
                const height = 2 - i * 0.25;
                const foliageGeometry = new THREE.ConeGeometry(size * scale, height * scale, 8);
                const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
                foliage.position.y = (2 + i * 1.2) * scale;
                foliage.castShadow = true;
                foliage.receiveShadow = true;
                tree.add(foliage);
            }
        }

        tree.position.set(x, 0, z);
        tree.rotation.y = Math.random() * Math.PI * 2;
        
        const boundingBox = new THREE.Box3().setFromObject(tree);
        trees.push({ mesh: tree, bounds: boundingBox });
        
        return tree;
    }

    // Define safe zones for tree placement
    const streetWidth = 40;  // Total width of street + sidewalks
    const safeDistance = 25; // Minimum distance from streets

    // Add trees in clusters, away from streets
    const numClusters = 40;
    for (let i = 0; i < numClusters; i++) {
        // Generate cluster center point
        const clusterX = -400 + Math.random() * 800;
        const clusterZ = -400 + Math.random() * 800;
        
        // Skip if too close to streets
        if (Math.abs(clusterX) < streetWidth * 2 || Math.abs(clusterZ) < streetWidth * 2) continue;
        
        // Create cluster of trees
        const numTrees = 8 + Math.floor(Math.random() * 8);
        for (let j = 0; j < numTrees; j++) {
            const offsetX = -20 + Math.random() * 40;
            const offsetZ = -20 + Math.random() * 40;
            const treeX = clusterX + offsetX;
            const treeZ = clusterZ + offsetZ;
            
            // Skip if individual tree is too close to streets
            if (Math.abs(treeX) < streetWidth * 2 || Math.abs(treeZ) < streetWidth * 2) continue;
            
            const scale = 0.8 + Math.random() * 0.6;
            scene.add(createTree(treeX, treeZ, scale));
        }
    }

    // Add additional scattered trees in safe zones
    for (let x = -450; x <= 450; x += 40) {
        for (let z = -450; z <= 450; z += 40) {
            // Skip if too close to streets
            if (Math.abs(x) < streetWidth * 2 || Math.abs(z) < streetWidth * 2) continue;
            
            // Random chance to place a tree
            if (Math.random() < 0.3) {
                const offsetX = -15 + Math.random() * 30;
                const offsetZ = -15 + Math.random() * 30;
                const treeX = x + offsetX;
                const treeZ = z + offsetZ;
                
                // Final safety check
                if (Math.abs(treeX) < streetWidth * 2 || Math.abs(treeZ) < streetWidth * 2) continue;
                
                const scale = 0.8 + Math.random() * 0.4;
                scene.add(createTree(treeX, treeZ, scale));
            }
        }
    }
}

// Start the game
init(); 