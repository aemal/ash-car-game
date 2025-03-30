// Three.js setup
let scene, camera, renderer, car, environment;
let controls;
let selectedCarType = null;
let previewScenes = [];
let previewCameras = [];
let previewRenderers = [];
let carModels = {};
let buildings = []; // Store building references
let isGameOver = false;
let fireParticles = null;
let countdownMesh = null;
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
let cameraMode = 'third'; // 'first' or 'third'
let maxSpeed = 400; // Increased maximum speed in km/h
let currentSpeedKmh = 0;
let cameraAngle = 0; // Track camera rotation
let accelerationRate = 0.8; // Base acceleration rate
let maxAcceleration = 0.5; // Maximum acceleration

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

    // Initialize car selection
    initCarSelection();
}

// Create the environment (streets, buildings, etc.)
function createEnvironment() {
    // Create ground
    const groundGeometry = new THREE.PlaneGeometry(1000, 1000);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x333333,
        roughness: 0.8,
        metalness: 0.2
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    ground.receiveShadow = true;
    scene.add(ground);

    // Create streets
    createStreets();

    // Create buildings
    createBuildings();
}

// Create street network
function createStreets() {
    const streetMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x444444,
        roughness: 0.9,
        metalness: 0.1
    });

    // Main road
    const mainRoad = new THREE.Mesh(
        new THREE.PlaneGeometry(20, 1000),
        streetMaterial
    );
    mainRoad.rotation.x = -Math.PI / 2;
    mainRoad.position.y = 0;
    mainRoad.receiveShadow = true;
    scene.add(mainRoad);

    // Cross streets
    for (let i = -400; i <= 400; i += 200) {
        const crossStreet = new THREE.Mesh(
            new THREE.PlaneGeometry(1000, 20),
            streetMaterial
        );
        crossStreet.rotation.x = -Math.PI / 2;
        crossStreet.position.set(0, 0, i);
        crossStreet.receiveShadow = true;
        scene.add(crossStreet);
    }

    // Add street lines
    createStreetLines();
}

// Create street lines
function createStreetLines() {
    const lineMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 0.5
    });

    // Center lines
    for (let i = -500; i < 500; i += 4) {
        const line = new THREE.Mesh(
            new THREE.PlaneGeometry(0.2, 2),
            lineMaterial
        );
        line.rotation.x = -Math.PI / 2;
        line.position.set(0, 0.1, i);
        line.receiveShadow = true;
        scene.add(line);
    }

    // Cross street lines
    for (let i = -500; i < 500; i += 4) {
        const line = new THREE.Mesh(
            new THREE.PlaneGeometry(2, 0.2),
            lineMaterial
        );
        line.rotation.x = -Math.PI / 2;
        line.position.set(i, 0.1, 0);
        line.receiveShadow = true;
        scene.add(line);
    }
}

// Create buildings
function createBuildings() {
    const buildingMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x888888,
        roughness: 0.7,
        metalness: 0.3
    });

    // Create random buildings
    for (let i = 0; i < 50; i++) {
        const height = Math.random() * 20 + 10;
        const width = Math.random() * 10 + 5;
        const depth = Math.random() * 10 + 5;
        const x = (Math.random() - 0.5) * 800;
        const z = (Math.random() - 0.5) * 800;

        const building = new THREE.Mesh(
            new THREE.BoxGeometry(width, height, depth),
            buildingMaterial
        );
        building.position.set(x, height / 2, z);
        building.castShadow = true;
        building.receiveShadow = true;
        scene.add(building);
        
        // Store building with its bounding box
        const boundingBox = new THREE.Box3().setFromObject(building);
        buildings.push({ mesh: building, bounds: boundingBox });
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
function startGame() {
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

    // Remove OrbitControls - we'll use our custom camera system
    // controls = new THREE.OrbitControls(camera, renderer.domElement);
    // controls.enableDamping = true;
    // controls.dampingFactor = 0.05;
    // controls.maxDistance = 20;
    // controls.minDistance = 5;

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
    
    for (const building of buildings) {
        if (carBox.intersectsBox(building.bounds)) {
            handleCollision();
            break;
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
    
    // Reset game state
    isGameOver = false;
}

// Update car physics
function updateCarPhysics() {
    if (!car || isGameOver) return;

    const deltaTime = 1/60; // Assuming 60fps for consistent physics
    
    // Update speed based on acceleration with continuous acceleration
    if (keys['ArrowUp']) {
        // Increase acceleration rate the longer the key is held
        accelerationRate = Math.min(accelerationRate + 0.1 * deltaTime, 2.0);
        acceleration = Math.min(acceleration + accelerationRate * deltaTime, maxAcceleration);
        gear = 'D';
    } else if (keys['ArrowDown']) {
        accelerationRate = Math.min(accelerationRate + 0.1 * deltaTime, 1.0);
        acceleration = Math.max(acceleration - accelerationRate * deltaTime, -0.3);
        gear = 'R';
    } else {
        // Reset acceleration rate when not accelerating
        accelerationRate = 0.8;
        acceleration *= 0.98; // Reduced friction for more momentum
        if (Math.abs(acceleration) < 0.01) {
            acceleration = 0;
            gear = 'N';
        }
    }

    // Update speed with improved physics
    speed += acceleration;
    
    // Apply progressive air resistance (less at lower speeds, more at higher speeds)
    const airResistance = Math.pow(Math.abs(speed), 1.3) * 0.0005;
    speed *= (1 - airResistance);

    // Convert speed to km/h for display (speed is in units/frame)
    currentSpeedKmh = Math.abs(speed * 3600); // Convert to km/h

    // Clamp speed to maximum with smooth approach
    if (currentSpeedKmh > maxSpeed) {
        const excess = (currentSpeedKmh - maxSpeed) / maxSpeed;
        speed *= (1 - excess * 0.1); // Smooth speed limiting
        currentSpeedKmh = Math.min(currentSpeedKmh, maxSpeed);
    }

    // Update camera angle based on left/right keys with speed-based sensitivity
    const turnSensitivity = Math.max(0.01, 0.03 * (1 - currentSpeedKmh / (maxSpeed * 1.5)));
    if (keys['ArrowLeft']) {
        cameraAngle += turnSensitivity * (1 + currentSpeedKmh / 100);
    } else if (keys['ArrowRight']) {
        cameraAngle -= turnSensitivity * (1 + currentSpeedKmh / 100);
    }

    // Calculate movement direction based on camera angle
    const moveAngle = cameraAngle;
    
    // Update car position and rotation with speed-based movement
    const moveSpeed = speed * (1 + currentSpeedKmh / maxSpeed * 0.5); // Increase movement speed at higher speeds
    car.position.x += Math.sin(moveAngle) * moveSpeed;
    car.position.z += Math.cos(moveAngle) * moveSpeed;
    car.position.y = 0.5; // Keep the car at a fixed height
    
    // Rotate car to face movement direction with smooth interpolation
    const targetRotation = moveAngle;
    car.rotation.y = targetRotation;

    // Update HUD
    document.getElementById('speedValue').textContent = Math.round(currentSpeedKmh);
    document.getElementById('gearValue').textContent = gear;

    // Check for collisions after updating position
    checkCollisions();
}

// Update camera position
function updateCamera() {
    if (!car) return;

    const idealOffset = new THREE.Vector3();
    const idealLookat = new THREE.Vector3();
    
    if (cameraMode === 'third') {
        // Calculate ideal camera position
        const distance = 7;
        const height = 3;
        
        // Calculate the ideal camera position behind the car
        idealOffset.set(
            car.position.x - Math.sin(cameraAngle) * distance,
            car.position.y + height,
            car.position.z - Math.cos(cameraAngle) * distance
        );
        
        // Calculate the look-at point slightly ahead of the car
        idealLookat.set(
            car.position.x + Math.sin(cameraAngle) * 5,
            car.position.y + 1,
            car.position.z + Math.cos(cameraAngle) * 5
        );
        
        // Smoothly interpolate camera position
        camera.position.lerp(idealOffset, 0.1);
        
        // Always look at the target point
        camera.lookAt(idealLookat);
        
    } else {
        // First person view
        const height = 1.5;
        const distance = 0.5;
        
        // Position camera at driver's position
        camera.position.set(
            car.position.x + Math.sin(cameraAngle) * distance,
            car.position.y + height,
            car.position.z + Math.cos(cameraAngle) * distance
        );
        
        // Look in the direction the car is facing
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
    
    renderer.render(scene, camera);
}

// Start the game
init(); 