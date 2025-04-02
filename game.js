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
    gear: new Audio('sounds/gear.mp3'),
    birds: new Audio('sounds/bird.wav')
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
        
        // Set up background bird sounds
        sounds.birds.loop = true;
        sounds.birds.volume = 0.2;  // Lower volume for ambient effect
        
        // Add error handlers
        Object.keys(sounds).forEach(key => {
            sounds[key].onerror = (e) => {
                console.error(`❌ Error loading sound ${key}:`, e);
            };
            sounds[key].oncanplaythrough = () => {
                console.log(`✅ Sound loaded: ${key}`);
            };
        });

        // Start playing background bird sounds
        sounds.birds.play().catch(e => console.log('Waiting for user interaction to play bird sounds'));

        // Add click handler to start audio
        document.addEventListener('click', () => {
            // Start both engine and bird sounds
            if (sounds.engine.paused) {
                sounds.engine.play().catch(e => console.log('Waiting for game to start'));
            }
            if (sounds.birds.paused) {
                sounds.birds.play().catch(e => console.log('Error playing bird sounds:', e));
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
        document.querySelector('.loading-message').style.display = 'none';
    },
    // onProgress
    (url, itemsLoaded, itemsTotal) => {
        console.log(`🔄 Loading file: ${url}`);
        console.log(`Progress: ${itemsLoaded} / ${itemsTotal}`);
        const loadingMessage = document.querySelector('.loading-message');
        loadingMessage.style.display = 'block';
        loadingMessage.textContent = `Loading 3D models... (${itemsLoaded}/${itemsTotal})`;
    },
    // onError
    (url) => {
        console.error('❌ Error loading:', url);
        document.querySelector('.loading-message').style.display = 'none';
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
let maxSpeed = 50;
let currentSpeedKmh = 0;
let cameraAngle = 0;
let turnAngle = 0;
let accelerationRate = 0.5;
let maxAcceleration = 0.5;
let turnSpeed = 0.06;
let driftFactor = 0.95; // Increased from 0.92 for smoother turning
let returnToCenter = 0.98; // New variable to control how quickly the car straightens

// Game state
let keys = {};
let isGameStarted = false;

// Add world size constant at the top with other constants
const WORLD_SIZE = 1000; // Size of the world in units

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

    // Hide loading message initially
    const loadingMessage = document.querySelector('.loading-message');
    loadingMessage.style.display = 'none';

    // Initialize sound system
    soundManager.init();

    // Initialize car selection
    initCarSelection();
    initCarSettings();

    // Start animation loop
    animate();
}

// Create the environment (streets, buildings, etc.)
function createEnvironment() {
    // Create ground with green base
    const groundGeometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x2d5a27,
        roughness: 1,
        metalness: 0
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Create multiple grass patches with varying colors
    const grassColors = [
        0x2d5a27, 0x3a6b33, 0x4a7b43, 0x5a8b53, 0x2d6a27,
        0x3d7a33, 0x355e2b, 0x446b32, 0x2d4a27, 0x3d5a33, 0x4d6a3f
    ];

    // Create multiple base grass layers
    for (let i = 0; i < 5; i++) {
        const grassGeometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE);
        const grassMaterial = new THREE.MeshStandardMaterial({ 
            color: grassColors[i % grassColors.length],
            roughness: 1,
            metalness: 0,
            opacity: 0.8,
            transparent: true
        });
        const grass = new THREE.Mesh(grassGeometry, grassMaterial);
        grass.rotation.x = -Math.PI / 2;
        grass.position.y = -0.15 - (i * 0.001);
        grass.receiveShadow = true;
        scene.add(grass);
    }

    // Add grass patches for ultra-dense coverage
    const patchSizes = [20, 30, 40, 50, 75];
    const numPatches = 1000;
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
        patch.position.set(
            -WORLD_SIZE/2 + Math.random() * WORLD_SIZE,
            -0.14 + Math.random() * 0.04,
            -WORLD_SIZE/2 + Math.random() * WORLD_SIZE
        );
        patch.rotation.z = Math.random() * Math.PI * 2;
        patch.receiveShadow = true;
        scene.add(patch);
    }

    // Create streets
    createStreets();

    // Create buildings
    createBuildings();

    // Add trees
    createTrees();
}

// Create street network
function createStreets() {
    const streetMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x333333,
        roughness: 0.9,
        metalness: 0.1
    });

    const sidewalkMaterial = new THREE.MeshStandardMaterial({
        color: 0x777777,
        roughness: 0.8,
        metalness: 0.1
    });

    // Define street parameters
    const mainRoadWidth = 12;  // Wider main roads
    const sideRoadWidth = 8;   // Narrower side roads
    const sidewalkWidth = 1.5; // Wider sidewalks
    const blockSize = 200;     // Size of city blocks (area between streets)
    
    // Create a symmetric grid of streets
    // First, create the main horizontal and vertical streets
    for (let i = -WORLD_SIZE/2; i <= WORLD_SIZE/2; i += blockSize + mainRoadWidth + sidewalkWidth * 2) {
        // Main horizontal street
        const horizontalStreet = new THREE.Mesh(
            new THREE.PlaneGeometry(WORLD_SIZE, mainRoadWidth),
            streetMaterial
        );
        horizontalStreet.rotation.x = -Math.PI / 2;
        horizontalStreet.position.set(0, 0.01, i);
        horizontalStreet.receiveShadow = true;
        scene.add(horizontalStreet);
        
        // Sidewalks for horizontal street
        const horizontalSidewalkTop = new THREE.Mesh(
            new THREE.PlaneGeometry(WORLD_SIZE, sidewalkWidth),
            sidewalkMaterial
        );
        horizontalSidewalkTop.rotation.x = -Math.PI / 2;
        horizontalSidewalkTop.position.set(0, 0.02, i - mainRoadWidth/2 - sidewalkWidth/2);
        horizontalSidewalkTop.receiveShadow = true;
        scene.add(horizontalSidewalkTop);
        
        const horizontalSidewalkBottom = horizontalSidewalkTop.clone();
        horizontalSidewalkBottom.position.z = i + mainRoadWidth/2 + sidewalkWidth/2;
        scene.add(horizontalSidewalkBottom);
        
        // Main vertical street
        const verticalStreet = new THREE.Mesh(
            new THREE.PlaneGeometry(mainRoadWidth, WORLD_SIZE),
            streetMaterial
        );
        verticalStreet.rotation.x = -Math.PI / 2;
        verticalStreet.position.set(i, 0.01, 0);
        verticalStreet.receiveShadow = true;
        scene.add(verticalStreet);
        
        // Sidewalks for vertical street
        const verticalSidewalkLeft = new THREE.Mesh(
            new THREE.PlaneGeometry(sidewalkWidth, WORLD_SIZE),
            sidewalkMaterial
        );
        verticalSidewalkLeft.rotation.x = -Math.PI / 2;
        verticalSidewalkLeft.position.set(i - mainRoadWidth/2 - sidewalkWidth/2, 0.02, 0);
        verticalSidewalkLeft.receiveShadow = true;
        scene.add(verticalSidewalkLeft);
        
        const verticalSidewalkRight = verticalSidewalkLeft.clone();
        verticalSidewalkRight.position.x = i + mainRoadWidth/2 + sidewalkWidth/2;
        scene.add(verticalSidewalkRight);
    }
    
    // Create secondary streets (narrower) between main streets
    for (let i = -WORLD_SIZE/2 + blockSize/2 + mainRoadWidth/2 + sidewalkWidth; 
         i <= WORLD_SIZE/2 - blockSize/2 - mainRoadWidth/2 - sidewalkWidth; 
         i += blockSize + mainRoadWidth + sidewalkWidth * 2) {
        
        // Secondary horizontal street
        const secondaryHorizontalStreet = new THREE.Mesh(
            new THREE.PlaneGeometry(WORLD_SIZE, sideRoadWidth),
            streetMaterial
        );
        secondaryHorizontalStreet.rotation.x = -Math.PI / 2;
        secondaryHorizontalStreet.position.set(0, 0.01, i);
        secondaryHorizontalStreet.receiveShadow = true;
        scene.add(secondaryHorizontalStreet);
        
        // Sidewalks for secondary horizontal street
        const secondaryHorizontalSidewalkTop = new THREE.Mesh(
            new THREE.PlaneGeometry(WORLD_SIZE, sidewalkWidth),
            sidewalkMaterial
        );
        secondaryHorizontalSidewalkTop.rotation.x = -Math.PI / 2;
        secondaryHorizontalSidewalkTop.position.set(0, 0.02, i - sideRoadWidth/2 - sidewalkWidth/2);
        secondaryHorizontalSidewalkTop.receiveShadow = true;
        scene.add(secondaryHorizontalSidewalkTop);
        
        const secondaryHorizontalSidewalkBottom = secondaryHorizontalSidewalkTop.clone();
        secondaryHorizontalSidewalkBottom.position.z = i + sideRoadWidth/2 + sidewalkWidth/2;
        scene.add(secondaryHorizontalSidewalkBottom);
        
        // Secondary vertical street
        const secondaryVerticalStreet = new THREE.Mesh(
            new THREE.PlaneGeometry(sideRoadWidth, WORLD_SIZE),
            streetMaterial
        );
        secondaryVerticalStreet.rotation.x = -Math.PI / 2;
        secondaryVerticalStreet.position.set(i, 0.01, 0);
        secondaryVerticalStreet.receiveShadow = true;
        scene.add(secondaryVerticalStreet);
        
        // Sidewalks for secondary vertical street
        const secondaryVerticalSidewalkLeft = new THREE.Mesh(
            new THREE.PlaneGeometry(sidewalkWidth, WORLD_SIZE),
            sidewalkMaterial
        );
        secondaryVerticalSidewalkLeft.rotation.x = -Math.PI / 2;
        secondaryVerticalSidewalkLeft.position.set(i - sideRoadWidth/2 - sidewalkWidth/2, 0.02, 0);
        secondaryVerticalSidewalkLeft.receiveShadow = true;
        scene.add(secondaryVerticalSidewalkLeft);
        
        const secondaryVerticalSidewalkRight = secondaryVerticalSidewalkLeft.clone();
        secondaryVerticalSidewalkRight.position.x = i + sideRoadWidth/2 + sidewalkWidth/2;
        scene.add(secondaryVerticalSidewalkRight);
    }
    
    // Create street lines for all streets
    createStreetLines(mainRoadWidth, sideRoadWidth, blockSize);
}

// Enhanced street lines function
function createStreetLines(mainRoadWidth, sideRoadWidth, blockSize) {
    const lineMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 0.5
    });

    const yellowLineMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffff00,
        emissive: 0xffff00,
        emissiveIntensity: 0.3
    });

    // Create lines for main streets
    for (let i = -WORLD_SIZE/2; i <= WORLD_SIZE/2; i += blockSize + mainRoadWidth + 3) {
        // Horizontal main street lines
        for (let x = -WORLD_SIZE/2; x < WORLD_SIZE/2; x += 4) {
            // Center yellow lines
            const leftYellowLine = new THREE.Mesh(
                new THREE.PlaneGeometry(2, 0.3),
                yellowLineMaterial
            );
            leftYellowLine.rotation.x = -Math.PI / 2;
            leftYellowLine.position.set(x, 0.1, i - 0.8);
            scene.add(leftYellowLine);

            const rightYellowLine = leftYellowLine.clone();
            rightYellowLine.position.z = i + 0.8;
            scene.add(rightYellowLine);

            // White lane dividers
            const leftLaneLine = new THREE.Mesh(
                new THREE.PlaneGeometry(2, 0.2),
                lineMaterial
            );
            leftLaneLine.rotation.x = -Math.PI / 2;
            leftLaneLine.position.set(x, 0.1, i - mainRoadWidth/4);
            scene.add(leftLaneLine);

            const rightLaneLine = leftLaneLine.clone();
            rightLaneLine.position.z = i + mainRoadWidth/4;
            scene.add(rightLaneLine);
        }
        
        // Vertical main street lines
        for (let z = -WORLD_SIZE/2; z < WORLD_SIZE/2; z += 4) {
            // Center yellow lines
            const leftYellowLine = new THREE.Mesh(
                new THREE.PlaneGeometry(0.3, 2),
                yellowLineMaterial
            );
            leftYellowLine.rotation.x = -Math.PI / 2;
            leftYellowLine.position.set(i - 0.8, 0.1, z);
            scene.add(leftYellowLine);

            const rightYellowLine = leftYellowLine.clone();
            rightYellowLine.position.x = i + 0.8;
            scene.add(rightYellowLine);

            // White lane dividers
            const leftLaneLine = new THREE.Mesh(
                new THREE.PlaneGeometry(0.2, 2),
                lineMaterial
            );
            leftLaneLine.rotation.x = -Math.PI / 2;
            leftLaneLine.position.set(i - mainRoadWidth/4, 0.1, z);
            scene.add(leftLaneLine);

            const rightLaneLine = leftLaneLine.clone();
            rightLaneLine.position.x = i + mainRoadWidth/4;
            scene.add(rightLaneLine);
        }
    }
    
    // Create lines for secondary streets
    for (let i = -WORLD_SIZE/2 + blockSize/2 + mainRoadWidth/2 + 3; 
         i <= WORLD_SIZE/2 - blockSize/2 - mainRoadWidth/2 - 3; 
         i += blockSize + mainRoadWidth + 3) {
        
        // Horizontal secondary street lines
        for (let x = -WORLD_SIZE/2; x < WORLD_SIZE/2; x += 4) {
            // Center yellow lines
            const leftYellowLine = new THREE.Mesh(
                new THREE.PlaneGeometry(2, 0.3),
                yellowLineMaterial
            );
            leftYellowLine.rotation.x = -Math.PI / 2;
            leftYellowLine.position.set(x, 0.1, i - 0.6);
            scene.add(leftYellowLine);

            const rightYellowLine = leftYellowLine.clone();
            rightYellowLine.position.z = i + 0.6;
            scene.add(rightYellowLine);

            // White lane dividers
            const leftLaneLine = new THREE.Mesh(
                new THREE.PlaneGeometry(2, 0.2),
                lineMaterial
            );
            leftLaneLine.rotation.x = -Math.PI / 2;
            leftLaneLine.position.set(x, 0.1, i - sideRoadWidth/4);
            scene.add(leftLaneLine);

            const rightLaneLine = leftLaneLine.clone();
            rightLaneLine.position.z = i + sideRoadWidth/4;
            scene.add(rightLaneLine);
        }
        
        // Vertical secondary street lines
        for (let z = -WORLD_SIZE/2; z < WORLD_SIZE/2; z += 4) {
            // Center yellow lines
            const leftYellowLine = new THREE.Mesh(
                new THREE.PlaneGeometry(0.3, 2),
                yellowLineMaterial
            );
            leftYellowLine.rotation.x = -Math.PI / 2;
            leftYellowLine.position.set(i - 0.6, 0.1, z);
            scene.add(leftYellowLine);

            const rightYellowLine = leftYellowLine.clone();
            rightYellowLine.position.x = i + 0.6;
            scene.add(rightYellowLine);

            // White lane dividers
            const leftLaneLine = new THREE.Mesh(
                new THREE.PlaneGeometry(0.2, 2),
                lineMaterial
            );
            leftLaneLine.rotation.x = -Math.PI / 2;
            leftLaneLine.position.set(i - sideRoadWidth/4, 0.1, z);
            scene.add(leftLaneLine);

            const rightLaneLine = leftLaneLine.clone();
            rightLaneLine.position.x = i + sideRoadWidth/4;
            scene.add(rightLaneLine);
        }
    }
}

// Create buildings
function createBuildings() {
    const buildingColors = [
        0xcc8866,  // Brick red
        0x99aa77,  // Olive
        0x6677aa,  // Steel blue
        0x888888,  // Gray
        0xddbb99,  // Tan
        0xaa7766,  // Dark brick
        0x7799aa,  // Light blue
        0x997755,  // Brown
        0x668899,  // Slate
        0xbb9977   // Sand
    ];

    // Define city blocks (areas where buildings can be placed)
    const mainRoadWidth = 12;  // Width of main roads
    const sideRoadWidth = 8;   // Width of side roads
    const sidewalkWidth = 1.5; // Width of sidewalks
    const blockSize = 200;     // Size of city blocks (area between streets)
    const safeDistance = 10;   // Safe distance from streets (increased from 5)
    
    // Create buildings in each block
    for (let x = -WORLD_SIZE/2 + mainRoadWidth/2 + sidewalkWidth + safeDistance; 
         x <= WORLD_SIZE/2 - mainRoadWidth/2 - sidewalkWidth - safeDistance; 
         x += blockSize + mainRoadWidth + sidewalkWidth * 2) {
        
        for (let z = -WORLD_SIZE/2 + mainRoadWidth/2 + sidewalkWidth + safeDistance; 
             z <= WORLD_SIZE/2 - mainRoadWidth/2 - sidewalkWidth - safeDistance; 
             z += blockSize + mainRoadWidth + sidewalkWidth * 2) {
            
            // Create buildings in this block
            const buildingsInBlock = Math.floor(Math.random() * 4) + 3; // 3-6 buildings per block
            
            for (let b = 0; b < buildingsInBlock; b++) {
                const height = Math.random() * 40 + 20;  // 20-60 units tall
                const width = Math.random() * 25 + 15;   // 15-40 units wide
                const depth = Math.random() * 25 + 15;   // 15-40 units deep
                
                // Position within block, keeping margin from streets
                const margin = safeDistance;
                const xPos = x + Math.random() * (blockSize - width - margin * 2) + margin - blockSize/2;
                const zPos = z + Math.random() * (blockSize - depth - margin * 2) + margin - blockSize/2;
                
                // Create building
                const building = new THREE.Group();
                
                // Main building structure with random style
                const buildingStyle = Math.random();
                let buildingGeometry;
                
                if (buildingStyle < 0.3) { // 30% chance for modern style (taller, slimmer)
                    buildingGeometry = new THREE.BoxGeometry(width * 0.8, height, depth * 0.8);
                } else if (buildingStyle < 0.6) { // 30% chance for classic style (wider)
                    buildingGeometry = new THREE.BoxGeometry(width * 1.1, height * 0.9, depth * 1.1);
                } else { // 40% chance for standard style
                    buildingGeometry = new THREE.BoxGeometry(width, height, depth);
                }
                
                const buildingMaterial = new THREE.MeshStandardMaterial({ 
                    color: buildingColors[Math.floor(Math.random() * buildingColors.length)],
                    roughness: 0.7,
                    metalness: 0.2
                });
                
                const buildingMesh = new THREE.Mesh(buildingGeometry, buildingMaterial);
                buildingMesh.position.set(0, height/2, 0);
                building.add(buildingMesh);
                
                // Add windows with varying patterns
                const windowMaterial = new THREE.MeshStandardMaterial({
                    color: 0x88ccff,
                    emissive: 0x88ccff,
                    emissiveIntensity: 0.2
                });
                
                // Create window rows with random patterns
                const windowSize = 1;
                const windowSpacing = 3;
                const windowRows = Math.floor(height / windowSpacing) - 2;
                const windowCols = Math.floor(width / windowSpacing) - 1;
                
                // Random window pattern (some windows might be dark)
                for (let row = 1; row < windowRows; row++) {
                    for (let col = 0; col < windowCols; col++) {
                        if (Math.random() < 0.8) { // 80% chance for window
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
                }
                
                // Add random architectural details
                if (Math.random() < 0.3) { // 30% chance for rooftop details
                    const roofGeometry = new THREE.BoxGeometry(width * 1.2, height * 0.1, depth * 1.2);
                    const roofMaterial = new THREE.MeshStandardMaterial({
                        color: 0x666666,
                        roughness: 0.8,
                        metalness: 0.2
                    });
                    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
                    roof.position.y = height + height * 0.05;
                    building.add(roof);
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

// Animate car previews
function animatePreviews() {
    requestAnimationFrame(animatePreviews);
    
    previewScenes.forEach((scene, index) => {
        if (scene.children.length > 0) {
            // Rotate the car model
            scene.children[0].rotation.y += 0.01;
            
            // Render the preview
            if (previewRenderers[index] && previewCameras[index]) {
                previewRenderers[index].render(scene, previewCameras[index]);
            }
        }
    });
}

// Initialize car selection
function initCarSelection() {
    console.log('🚗 Initializing car selection...');
    const loader = new THREE.GLTFLoader(loadingManager);
    const carTypes = ['sports', 'muscle', 'classic', 'modern', 'luxury', 'retro'];
    let loadedModels = 0;

    // Show car selection menu
    document.querySelector('.car-selection-menu').style.display = 'flex';
    document.querySelector('.game-container').style.display = 'none';

    // Create preview scenes for each car
    carTypes.forEach(type => {
        console.log(`🎨 Setting up preview scene for ${type} car`);
        const previewScene = new THREE.Scene();
        previewScene.background = new THREE.Color(0x87CEEB);  // Sky blue background
        const previewCamera = new THREE.PerspectiveCamera(75, 300 / 200, 0.1, 1000);
        const previewRenderer = new THREE.WebGLRenderer({ antialias: true });
        
        previewRenderer.setSize(300, 200);
        const previewContainer = document.getElementById(`${type}CarPreview`);
        if (previewContainer) {
            previewContainer.innerHTML = ''; // Clear existing content
            previewContainer.appendChild(previewRenderer.domElement);
        }
        
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

        // Create and add basic car model
        const basicCar = createBasicCar(type);
        previewScene.add(basicCar);
        carModels[type] = basicCar;
    });

    // Add click handlers for car selection
    document.querySelectorAll('.car-option').forEach(option => {
        option.addEventListener('click', () => {
            // Remove selected class from all options
            document.querySelectorAll('.car-option').forEach(opt => {
                opt.classList.remove('selected');
                opt.style.setProperty('--car-color', 'transparent');
            });
            
            // Add selected class to clicked option
            option.classList.add('selected');
            const carColor = option.dataset.color;
            option.style.setProperty('--car-color', carColor);
            
            selectedCarType = option.dataset.car;
            console.log(`🚗 Selected car type: ${selectedCarType}`);
        });
    });

    // Start preview animations
    animatePreviews();
}

// Create a basic car as fallback
function createBasicCar(type) {
    const carGroup = new THREE.Group();
    
    // Car body dimensions
    const bodyWidth = 2;
    const bodyHeight = 1.2;
    const bodyLength = 4;
    
    // Colors based on car type
    const colors = {
        sports: {
            body: 0xff0000,    // Bright Red
            windows: 0x111111,  // Dark tint
            lights: 0xffffff,   // White
            trim: 0x333333,    // Dark gray
            headlightGlow: 0xffffcc, // Warm white glow
            taillightGlow: 0xff3333  // Bright red glow
        },
        muscle: {
            body: 0xff6600,    // Orange
            windows: 0x222222,  // Dark tint
            lights: 0xffffff,   // White
            trim: 0x444444,    // Medium gray
            headlightGlow: 0xffffcc, // Warm white glow
            taillightGlow: 0xff3333  // Bright red glow
        },
        classic: {
            body: 0x009900,    // Dark green
            windows: 0x333333,  // Medium tint
            lights: 0xffffff,   // White
            trim: 0xcccccc,    // Light gray
            headlightGlow: 0xffffcc, // Warm white glow
            taillightGlow: 0xff3333  // Bright red glow
        },
        modern: {
            body: 0x0066ff,    // Bright Blue
            windows: 0x222222,  // Dark tint
            lights: 0xffffff,   // White
            trim: 0x555555,    // Medium gray
            headlightGlow: 0xffffcc, // Warm white glow
            taillightGlow: 0xff3333  // Bright red glow
        },
        luxury: {
            body: 0x1a1a1a,    // Black
            windows: 0x111111,  // Very dark tint
            lights: 0xffffff,   // White
            trim: 0xc0c0c0,    // Silver
            headlightGlow: 0xffffcc, // Warm white glow
            taillightGlow: 0xff3333  // Bright red glow
        },
        retro: {
            body: 0xff9933,    // Classic Orange
            windows: 0x444444,  // Light tint
            lights: 0xffffff,   // White
            trim: 0xdddddd,    // Light silver
            headlightGlow: 0xffffcc, // Warm white glow
            taillightGlow: 0xff3333  // Bright red glow
        }
    };

    const carColor = colors[type] || colors.sports;

    // Main body (lower part)
    const bodyGeometry = new THREE.BoxGeometry(bodyWidth, bodyHeight * 0.7, bodyLength);
    const bodyMaterial = new THREE.MeshPhongMaterial({
        color: carColor.body,
        specular: 0x555555,
        shininess: 100
    });
    const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
    bodyMesh.position.y = bodyHeight * 0.4;
    carGroup.add(bodyMesh);

    // Upper body (cabin)
    const cabinGeometry = new THREE.BoxGeometry(bodyWidth * 0.8, bodyHeight * 0.5, bodyLength * 0.6);
    const cabinMaterial = new THREE.MeshPhysicalMaterial({
        color: carColor.windows,
        transparent: true,
        opacity: 0.7,
        metalness: 0.9,
        roughness: 0.1,
        envMapIntensity: 1,
        clearcoat: 1,
        clearcoatRoughness: 0.1,
        transmission: 0.5,
        reflectivity: 1
    });
    const cabinMesh = new THREE.Mesh(cabinGeometry, cabinMaterial);
    cabinMesh.position.y = bodyHeight * 0.95;
    carGroup.add(cabinMesh);

    // Windows with enhanced glass effect
    const windowMaterial = new THREE.MeshPhysicalMaterial({
        color: carColor.windows,
        transparent: true,
        opacity: 0.7,
        metalness: 0.9,
        roughness: 0.1,
        envMapIntensity: 1,
        clearcoat: 1,
        clearcoatRoughness: 0.1,
        transmission: 0.5,
        reflectivity: 1
    });

    // Windshield
    const windshieldGeometry = new THREE.PlaneGeometry(bodyWidth * 0.75, bodyHeight * 0.5);
    const windshield = new THREE.Mesh(windshieldGeometry, windowMaterial);
    windshield.position.set(0, bodyHeight * 0.9, bodyLength * 0.15);
    windshield.rotation.x = Math.PI * 0.2;
    carGroup.add(windshield);

    // Rear window
    const rearWindow = new THREE.Mesh(windshieldGeometry, windowMaterial);
    rearWindow.position.set(0, bodyHeight * 0.9, -bodyLength * 0.15);
    rearWindow.rotation.x = -Math.PI * 0.2;
    carGroup.add(rearWindow);

    // Side windows
    const sideWindowGeometry = new THREE.PlaneGeometry(bodyLength * 0.4, bodyHeight * 0.4);
    [-1, 1].forEach(side => {
        const sideWindow = new THREE.Mesh(sideWindowGeometry, windowMaterial);
        sideWindow.position.set(side * (bodyWidth * 0.4), bodyHeight * 0.9, 0);
        sideWindow.rotation.y = side * Math.PI * 0.5;
        carGroup.add(sideWindow);
    });

    // Wheels
    const wheelGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 24);
    const wheelMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x333333,
        specular: 0x444444,
        shininess: 30
    });

    // Wheel positions
    const wheelPositions = [
        { x: -bodyWidth * 0.5, y: 0.4, z: bodyLength * 0.3 },  // Front Left
        { x: bodyWidth * 0.5, y: 0.4, z: bodyLength * 0.3 },   // Front Right
        { x: -bodyWidth * 0.5, y: 0.4, z: -bodyLength * 0.3 }, // Rear Left
        { x: bodyWidth * 0.5, y: 0.4, z: -bodyLength * 0.3 }   // Rear Right
    ];

    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.position.set(pos.x, pos.y, pos.z);
        wheel.rotation.z = Math.PI * 0.5;
        carGroup.add(wheel);

        // Add wheel rim
        const rimGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.31, 8);
        const rimMaterial = new THREE.MeshPhongMaterial({
            color: carColor.trim,
            specular: 0xffffff,
            shininess: 100
        });
        const rim = new THREE.Mesh(rimGeometry, rimMaterial);
        wheel.add(rim);
    });

    // Enhanced headlights with multiple components
    const headlightGeometry = new THREE.CircleGeometry(0.2, 16);
    const headlightMaterial = new THREE.MeshPhysicalMaterial({
        color: carColor.lights,
        emissive: carColor.lights,
        emissiveIntensity: 5,
        metalness: 0.9,
        roughness: 0.1,
        clearcoat: 1,
        reflectivity: 1
    });

    const headlightGlowMaterial = new THREE.MeshPhysicalMaterial({
        color: carColor.headlightGlow,
        emissive: carColor.headlightGlow,
        emissiveIntensity: 8,
        transparent: true,
        opacity: 0.9
    });

    [-0.6, 0.6].forEach(x => {
        // Main headlight
        const headlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
        headlight.position.set(x, bodyHeight * 0.4, bodyLength * 0.5 + 0.01);
        carGroup.add(headlight);

        // Add actual light source for headlights
        const headlightSource = new THREE.PointLight(carColor.headlightGlow, 2, 50);
        headlightSource.position.set(x, bodyHeight * 0.4, bodyLength * 0.5 + 0.5);
        carGroup.add(headlightSource);

        // Headlight glow
        const headlightGlow = new THREE.Mesh(
            new THREE.CircleGeometry(0.4, 32),
            headlightGlowMaterial
        );
        headlightGlow.position.set(x, bodyHeight * 0.4, bodyLength * 0.5);
        carGroup.add(headlightGlow);

        // Additional outer glow
        const outerGlow = new THREE.Mesh(
            new THREE.CircleGeometry(0.6, 32),
            new THREE.MeshPhysicalMaterial({
                color: carColor.headlightGlow,
                emissive: carColor.headlightGlow,
                emissiveIntensity: 4,
                transparent: true,
                opacity: 0.4
            })
        );
        outerGlow.position.set(x, bodyHeight * 0.4, bodyLength * 0.5 - 0.01);
        carGroup.add(outerGlow);

        // Headlight housing (chrome ring)
        const headlightHousing = new THREE.Mesh(
            new THREE.RingGeometry(0.18, 0.22, 16),
            new THREE.MeshPhysicalMaterial({
                color: 0xcccccc,
                metalness: 1,
                roughness: 0.1,
                clearcoat: 1
            })
        );
        headlightHousing.position.set(x, bodyHeight * 0.4, bodyLength * 0.5 + 0.02);
        carGroup.add(headlightHousing);
    });

    // Enhanced taillights with multiple components
    const taillightGeometry = new THREE.CircleGeometry(0.2, 16);
    const taillightMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xff0000,
        emissive: 0xff0000,
        emissiveIntensity: 5,
        metalness: 0.5,
        roughness: 0.2,
        clearcoat: 1
    });

    const taillightGlowMaterial = new THREE.MeshPhysicalMaterial({
        color: carColor.taillightGlow,
        emissive: carColor.taillightGlow,
        emissiveIntensity: 8,
        transparent: true,
        opacity: 0.9
    });

    [-0.6, 0.6].forEach(x => {
        // Main taillight
        const taillight = new THREE.Mesh(taillightGeometry, taillightMaterial);
        taillight.position.set(x, bodyHeight * 0.4, -bodyLength * 0.5 - 0.01);
        carGroup.add(taillight);

        // Add actual light source for taillights
        const taillightSource = new THREE.PointLight(0xff0000, 1.5, 30);
        taillightSource.position.set(x, bodyHeight * 0.4, -bodyLength * 0.5 - 0.5);
        carGroup.add(taillightSource);

        // Taillight glow
        const taillightGlow = new THREE.Mesh(
            new THREE.CircleGeometry(0.4, 32),
            taillightGlowMaterial
        );
        taillightGlow.position.set(x, bodyHeight * 0.4, -bodyLength * 0.5);
        carGroup.add(taillightGlow);

        // Additional outer glow for taillights
        const outerGlow = new THREE.Mesh(
            new THREE.CircleGeometry(0.6, 32),
            new THREE.MeshPhysicalMaterial({
                color: carColor.taillightGlow,
                emissive: carColor.taillightGlow,
                emissiveIntensity: 4,
                transparent: true,
                opacity: 0.4
            })
        );
        outerGlow.position.set(x, bodyHeight * 0.4, -bodyLength * 0.5 + 0.01);
        carGroup.add(outerGlow);

        // Add brake light strip
        const brakeLight = new THREE.Mesh(
            new THREE.PlaneGeometry(0.4, 0.1),
            new THREE.MeshPhysicalMaterial({
                color: 0xff0000,
                emissive: 0xff0000,
                emissiveIntensity: 1,
                metalness: 0.5,
                roughness: 0.2
            })
        );
        brakeLight.position.set(x, bodyHeight * 0.6, -bodyLength * 0.5 - 0.01);
        carGroup.add(brakeLight);
    });

    // Grill
    const grillGeometry = new THREE.PlaneGeometry(bodyWidth * 0.7, bodyHeight * 0.3);
    const grillMaterial = new THREE.MeshPhongMaterial({
        color: carColor.trim,
        specular: 0x555555,
        shininess: 100
    });
    const grill = new THREE.Mesh(grillGeometry, grillMaterial);
    grill.position.set(0, bodyHeight * 0.3, bodyLength * 0.5 + 0.01);
    carGroup.add(grill);

    // Add bumpers
    const bumperGeometry = new THREE.BoxGeometry(bodyWidth * 1.1, bodyHeight * 0.2, 0.3);
    const bumperMaterial = new THREE.MeshPhongMaterial({
        color: carColor.trim,
        specular: 0x555555,
        shininess: 100
    });

    // Front bumper
    const frontBumper = new THREE.Mesh(bumperGeometry, bumperMaterial);
    frontBumper.position.set(0, bodyHeight * 0.2, bodyLength * 0.5);
    carGroup.add(frontBumper);

    // Rear bumper
    const rearBumper = new THREE.Mesh(bumperGeometry, bumperMaterial);
    rearBumper.position.set(0, bodyHeight * 0.2, -bodyLength * 0.5);
    carGroup.add(rearBumper);

    // Add shadows
    carGroup.traverse(object => {
        if (object instanceof THREE.Mesh) {
            object.castShadow = true;
            object.receiveShadow = true;
        }
    });

    return carGroup;
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
    if (event.key === 'Escape') {
        returnToCarSelection();
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
    
    // Stop engine sound but keep birds playing
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
    const friction = Math.abs(speed) * 0.015;
    speed *= (1 - friction);

    // Handle steering with improved speed-based sensitivity
    const speedFactor = Math.min(Math.abs(speed) / maxSpeed, 1);
    const currentTurnSpeed = turnSpeed * (1 + speedFactor * 0.5);

    if (keys['ArrowLeft']) {
        turnAngle += currentTurnSpeed * (1 - speedFactor * 0.3);
    } else if (keys['ArrowRight']) {
        turnAngle -= currentTurnSpeed * (1 - speedFactor * 0.3);
    }

    // Remove turn angle limits to allow full rotation
    // Update camera angle with smoother drift effect
    const turnInfluence = 1 - driftFactor;
    cameraAngle = cameraAngle * driftFactor + turnAngle * turnInfluence;

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

    // World wrapping
    if (car.position.x > WORLD_SIZE/2) {
        car.position.x -= WORLD_SIZE;
        updateEnvironmentPosition('x', -WORLD_SIZE);
    } else if (car.position.x < -WORLD_SIZE/2) {
        car.position.x += WORLD_SIZE;
        updateEnvironmentPosition('x', WORLD_SIZE);
    }
    if (car.position.z > WORLD_SIZE/2) {
        car.position.z -= WORLD_SIZE;
        updateEnvironmentPosition('z', -WORLD_SIZE);
    } else if (car.position.z < -WORLD_SIZE/2) {
        car.position.z += WORLD_SIZE;
        updateEnvironmentPosition('z', WORLD_SIZE);
    }
    
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
    const mainRoadWidth = 12;  // Width of main roads
    const sideRoadWidth = 8;   // Width of side roads
    const sidewalkWidth = 1.5; // Width of sidewalks
    const blockSize = 200;     // Size of city blocks (area between streets)
    const safeDistance = 25;   // Minimum distance from streets

    // Add trees in clusters, away from streets
    const numClusters = 40;
    for (let i = 0; i < numClusters; i++) {
        // Generate cluster center point
        const clusterX = -WORLD_SIZE/2 + Math.random() * WORLD_SIZE;
        const clusterZ = -WORLD_SIZE/2 + Math.random() * WORLD_SIZE;
        
        // Skip if too close to streets
        if (Math.abs(clusterX) < safeDistance || Math.abs(clusterZ) < safeDistance) continue;
        
        // Create cluster of trees
        const numTrees = 8 + Math.floor(Math.random() * 8);
        for (let j = 0; j < numTrees; j++) {
            const offsetX = -20 + Math.random() * 40;
            const offsetZ = -20 + Math.random() * 40;
            const treeX = clusterX + offsetX;
            const treeZ = clusterZ + offsetZ;
            
            // Skip if individual tree is too close to streets
            if (Math.abs(treeX) < safeDistance || Math.abs(treeZ) < safeDistance) continue;
            
            const scale = 0.8 + Math.random() * 0.6;
            scene.add(createTree(treeX, treeZ, scale));
        }
    }

    // Add additional scattered trees in safe zones
    for (let x = -WORLD_SIZE/2; x <= WORLD_SIZE/2; x += 40) {
        for (let z = -WORLD_SIZE/2; z <= WORLD_SIZE/2; z += 40) {
            // Skip if too close to streets
            if (Math.abs(x) < safeDistance || Math.abs(z) < safeDistance) continue;
            
            // Random chance to place a tree
            if (Math.random() < 0.3) {
                const offsetX = -15 + Math.random() * 30;
                const offsetZ = -15 + Math.random() * 30;
                const treeX = x + offsetX;
                const treeZ = z + offsetZ;
                
                // Final safety check
                if (Math.abs(treeX) < safeDistance || Math.abs(treeZ) < safeDistance) continue;
                
                const scale = 0.8 + Math.random() * 0.4;
                scene.add(createTree(treeX, treeZ, scale));
            }
        }
    }
}

// Add function to update environment position
function updateEnvironmentPosition(axis, offset) {
    // Update buildings
    buildings.forEach(building => {
        building.mesh.position[axis] += offset;
        building.bounds.translate(new THREE.Vector3(
            axis === 'x' ? offset : 0,
            0,
            axis === 'z' ? offset : 0
        ));

        // Wrap buildings around
        if (building.mesh.position[axis] > WORLD_SIZE/2) {
            building.mesh.position[axis] -= WORLD_SIZE;
            building.bounds.translate(new THREE.Vector3(
                axis === 'x' ? -WORLD_SIZE : 0,
                0,
                axis === 'z' ? -WORLD_SIZE : 0
            ));
        } else if (building.mesh.position[axis] < -WORLD_SIZE/2) {
            building.mesh.position[axis] += WORLD_SIZE;
            building.bounds.translate(new THREE.Vector3(
                axis === 'x' ? WORLD_SIZE : 0,
                0,
                axis === 'z' ? WORLD_SIZE : 0
            ));
        }
    });

    // Update trees
    trees.forEach(tree => {
        tree.mesh.position[axis] += offset;
        tree.bounds.translate(new THREE.Vector3(
            axis === 'x' ? offset : 0,
            0,
            axis === 'z' ? offset : 0
        ));

        // Wrap trees around
        if (tree.mesh.position[axis] > WORLD_SIZE/2) {
            tree.mesh.position[axis] -= WORLD_SIZE;
            tree.bounds.translate(new THREE.Vector3(
                axis === 'x' ? -WORLD_SIZE : 0,
                0,
                axis === 'z' ? -WORLD_SIZE : 0
            ));
        } else if (tree.mesh.position[axis] < -WORLD_SIZE/2) {
            tree.mesh.position[axis] += WORLD_SIZE;
            tree.bounds.translate(new THREE.Vector3(
                axis === 'x' ? WORLD_SIZE : 0,
                0,
                axis === 'z' ? WORLD_SIZE : 0
            ));
        }
    });

    // Update streets and sidewalks
    scene.children.forEach(child => {
        if (child instanceof THREE.Mesh && 
            (child.material.color.getHex() === 0x333333 || // Street material
             child.material.color.getHex() === 0x777777 || // Sidewalk material
             child.material.color.getHex() === 0xffff00 || // Yellow lines
             child.material.color.getHex() === 0xffffff)) { // White lines
            
            child.position[axis] += offset;

            // Wrap streets and lines around
            if (child.position[axis] > WORLD_SIZE/2) {
                child.position[axis] -= WORLD_SIZE;
            } else if (child.position[axis] < -WORLD_SIZE/2) {
                child.position[axis] += WORLD_SIZE;
            }
        }
    });

    // Update grass patches
    scene.children.forEach(child => {
        if (child instanceof THREE.Mesh && 
            child.material.color.getHex() === 0x2d5a27) { // Grass material
            
            child.position[axis] += offset;

            // Wrap grass patches around
            if (child.position[axis] > WORLD_SIZE/2) {
                child.position[axis] -= WORLD_SIZE;
            } else if (child.position[axis] < -WORLD_SIZE/2) {
                child.position[axis] += WORLD_SIZE;
            }
        }
    });

    // Update fire particles if they exist
    if (fireParticles) {
        const positions = fireParticles.geometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
            positions[i + (axis === 'x' ? 0 : 2)] += offset;
            
            // Wrap fire particles around
            if (positions[i + (axis === 'x' ? 0 : 2)] > WORLD_SIZE/2) {
                positions[i + (axis === 'x' ? 0 : 2)] -= WORLD_SIZE;
            } else if (positions[i + (axis === 'x' ? 0 : 2)] < -WORLD_SIZE/2) {
                positions[i + (axis === 'x' ? 0 : 2)] += WORLD_SIZE;
            }
        }
        fireParticles.geometry.attributes.position.needsUpdate = true;
    }
}

// Start game with selected car
async function startGame() {
    if (!selectedCarType) {
        alert('Please select a car first!');
        return;
    }

    // Get current settings values
    maxSpeed = parseInt(document.getElementById('maxSpeed').value);
    accelerationRate = parseFloat(document.getElementById('acceleration').value);
    turnSpeed = parseFloat(document.getElementById('turnSpeed').value);
    driftFactor = parseFloat(document.getElementById('driftFactor').value);

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

// Add function to return to car selection
function returnToCarSelection() {
    // Reset game state
    isGameStarted = false;
    
    // Stop engine sound but keep birds playing
    if (sounds.engine) {
        sounds.engine.pause();
        sounds.engine.currentTime = 0;
    }
    
    // Make sure bird sounds are playing
    if (sounds.birds && sounds.birds.paused) {
        sounds.birds.play().catch(e => console.log('Error playing bird sounds:', e));
    }
    
    // Remove current car from scene
    if (car) {
        scene.remove(car);
        car = null;
    }
    
    // Reset physics
    speed = 0;
    acceleration = 0;
    gear = 'N';
    
    // Reset camera
    cameraMode = 'third';
    cameraAngle = 0;
    
    // Show car selection menu and hide game container
    document.querySelector('.car-selection-menu').style.display = 'flex';
    document.querySelector('.game-container').style.display = 'none';
    
    // Reset car selection and colors
    selectedCarType = null;
    document.querySelectorAll('.car-option').forEach(opt => {
        opt.classList.remove('selected');
        opt.style.setProperty('--car-color', 'transparent');
    });
    
    // Restart preview animations
    animatePreviews();
}

// Add this function after init()
function initCarSettings() {
    // Get all range inputs
    const maxSpeedInput = document.getElementById('maxSpeed');
    const accelerationInput = document.getElementById('acceleration');
    const turnSpeedInput = document.getElementById('turnSpeed');
    const driftFactorInput = document.getElementById('driftFactor');

    // Update display values when sliders change
    maxSpeedInput.addEventListener('input', (e) => {
        document.getElementById('maxSpeedValue').textContent = e.target.value;
    });

    accelerationInput.addEventListener('input', (e) => {
        document.getElementById('accelerationValue').textContent = e.target.value;
    });

    turnSpeedInput.addEventListener('input', (e) => {
        document.getElementById('turnSpeedValue').textContent = e.target.value;
    });

    driftFactorInput.addEventListener('input', (e) => {
        document.getElementById('driftFactorValue').textContent = e.target.value;
    });
}

// Start the game
init(); 