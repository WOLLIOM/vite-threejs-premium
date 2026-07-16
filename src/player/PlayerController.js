import * as THREE from 'three';

export class PlayerController {
    constructor(camera, domElement, groundHeight = 0, isMobileDevice = false) {
        this.camera = camera;
        this.domElement = domElement;
        this.groundHeight = groundHeight;
        
        // Movement state
        this.velocity = new THREE.Vector3();
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.sprinting = false;
        this.jumping = false;
        this.isOnGround = false;

        // Parameters
        this.walkSpeed = 3.0;
        this.sprintSpeed = 5.0;
        this.jumpHeight = 0.3;
        this.gravity = -12;
        this.damping = 0.85;

        // Height
        this.playerHeight = 1.7;
        this.playerRadius = 0.3;
        this.camera.position.y = this.playerHeight + this.groundHeight;

        // Pointer lock
        this.isLocked = false;
        this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
        this.pitchMin = -Math.PI / 2 + 0.1;
        this.pitchMax = Math.PI / 2 - 0.1;

        // ── Collision ──
        this.collisionMeshes = [];
        this.raycaster = new THREE.Raycaster();
        this.tempVec = new THREE.Vector3();

        // ── Mobile mode is now based on the real device, passed in from
        // main.js — this was hardcoded true before, which auto-locked the
        // pointer (hid the cursor) on desktop after 1 second and made the
        // top bar unclickable until Escape. ──
        this.isMobile = isMobileDevice;
        this.isTouching = false;
        this.touchStartX = 0;
        this.touchStartY = 0;

        // ── Stuck detection ──
        this.stuckCounter = 0;
        this.lastPosition = new THREE.Vector3();

        // Bind events
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);
        this.onLockChange = this.onLockChange.bind(this);
        this.onClick = this.onClick.bind(this);
        this.onTouchStart = this.onTouchStart.bind(this);
        this.onTouchMove = this.onTouchMove.bind(this);
        this.onTouchEnd = this.onTouchEnd.bind(this);
    }

    setCollisionMeshes(meshes) {
        this.collisionMeshes = meshes;
        console.log(`🟢 Collision ENABLED: ${meshes.length} objects`);
    }

    enable() {
        document.addEventListener('keydown', this.onKeyDown);
        document.addEventListener('keyup', this.onKeyUp);
        document.addEventListener('mousemove', this.onMouseMove);
        document.addEventListener('pointerlockchange', this.onLockChange);
        this.domElement.addEventListener('click', this.onClick);
        
        this.domElement.addEventListener('touchstart', this.onTouchStart, { passive: false });
        this.domElement.addEventListener('touchmove', this.onTouchMove, { passive: false });
        this.domElement.addEventListener('touchend', this.onTouchEnd, { passive: false });
        this.domElement.addEventListener('touchcancel', this.onTouchEnd, { passive: false });

        if (this.isMobile) {
            setTimeout(() => {
                this.domElement.requestPointerLock?.();
            }, 1000);
        }
    }

    disable() {
        document.removeEventListener('keydown', this.onKeyDown);
        document.removeEventListener('keyup', this.onKeyUp);
        document.removeEventListener('mousemove', this.onMouseMove);
        document.removeEventListener('pointerlockchange', this.onLockChange);
        this.domElement.removeEventListener('click', this.onClick);
        this.domElement.removeEventListener('touchstart', this.onTouchStart);
        this.domElement.removeEventListener('touchmove', this.onTouchMove);
        this.domElement.removeEventListener('touchend', this.onTouchEnd);
        this.domElement.removeEventListener('touchcancel', this.onTouchEnd);
        
        if (document.pointerLockElement) document.exitPointerLock();
    }

    onClick() {
        if (!this.isLocked) {
            this.domElement.requestPointerLock();
        }
    }

    onLockChange() {
        this.isLocked = document.pointerLockElement === this.domElement;
    }

    onMouseMove(e) {
        if (!this.isLocked) return;
        const movementX = e.movementX || 0;
        const movementY = e.movementY || 0;
        this.euler.setFromQuaternion(this.camera.quaternion);
        this.euler.y -= movementX * 0.002;
        this.euler.x -= movementY * 0.002;
        this.euler.x = Math.max(this.pitchMin, Math.min(this.pitchMax, this.euler.x));
        this.camera.quaternion.setFromEuler(this.euler);
    }

    onTouchStart(e) {
        const touch = e.touches[0];
        if (touch) {
            this.touchStartX = touch.clientX;
            this.touchStartY = touch.clientY;
            this.isTouching = true;
            
            if (!this.isLocked && this.domElement.requestPointerLock) {
                this.domElement.requestPointerLock();
            }
        }
    }

    onTouchMove(e) {
        e.preventDefault();
        if (!this.isTouching || !this.isLocked) return;
        
        const touch = e.touches[0];
        if (touch) {
            const deltaX = touch.clientX - this.touchStartX;
            const deltaY = touch.clientY - this.touchStartY;
            
            this.euler.setFromQuaternion(this.camera.quaternion);
            this.euler.y -= deltaX * 0.005;
            this.euler.x -= deltaY * 0.005;
            this.euler.x = Math.max(this.pitchMin, Math.min(this.pitchMax, this.euler.x));
            this.camera.quaternion.setFromEuler(this.euler);
            
            this.touchStartX = touch.clientX;
            this.touchStartY = touch.clientY;
        }
    }

    onTouchEnd() {
        this.isTouching = false;
    }

    onKeyDown(e) {
        switch (e.code) {
            case 'KeyW': this.moveForward = true; break;
            case 'KeyS': this.moveBackward = true; break;
            case 'KeyA': this.moveLeft = true; break;
            case 'KeyD': this.moveRight = true; break;
            case 'ShiftLeft':
            case 'ShiftRight': this.sprinting = true; break;
            case 'Space':
                if (this.isOnGround) {
                    this.jumping = true;
                    this.isOnGround = false;
                }
                break;
        }
    }

    onKeyUp(e) {
        switch (e.code) {
            case 'KeyW': this.moveForward = false; break;
            case 'KeyS': this.moveBackward = false; break;
            case 'KeyA': this.moveLeft = false; break;
            case 'KeyD': this.moveRight = false; break;
            case 'ShiftLeft':
            case 'ShiftRight': this.sprinting = false; break;
        }
    }

    // ── 🔥 COLLISION CHECK ──
    canMoveTo(x, y, z) {
        if (this.collisionMeshes.length === 0) return true;

        const checkRadius = this.playerRadius;
        const offsets = [
            [0, 0], [checkRadius, 0], [-checkRadius, 0], 
            [0, checkRadius], [0, -checkRadius],
            [checkRadius * 0.7, checkRadius * 0.7],
            [-checkRadius * 0.7, checkRadius * 0.7],
            [checkRadius * 0.7, -checkRadius * 0.7],
            [-checkRadius * 0.7, -checkRadius * 0.7]
        ];

        for (const [ox, oz] of offsets) {
            const testPos = new THREE.Vector3(x + ox, y, z + oz);
            
            const origin = testPos.clone();
            origin.y += 3;
            const direction = new THREE.Vector3(0, -1, 0);
            
            this.raycaster.set(origin, direction);
            const intersects = this.raycaster.intersectObjects(this.collisionMeshes, true);
            
            if (intersects.length > 0) {
                const hit = intersects[0];
                if (hit.object.userData && hit.object.userData.isGround) {
                    continue;
                }
                if (hit.distance < 4 && hit.distance > 0.2) {
                    return false;
                }
            }
        }
        return true;
    }

    update(delta = 1/60) {
        // Movement (WASD / joystick) is intentionally NOT gated behind
        // pointer lock — only mouse-look needs the lock. This lets a
        // keyboard-only desktop user walk around immediately without
        // ever having to click into the canvas.
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        forward.y = 0;
        forward.normalize();
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
        right.y = 0;
        right.normalize();

        const speed = this.sprinting ? this.sprintSpeed : this.walkSpeed;

        const dir = new THREE.Vector3();
        if (this.moveForward) dir.add(forward);
        if (this.moveBackward) dir.sub(forward);
        if (this.moveLeft) dir.sub(right);
        if (this.moveRight) dir.add(right);
        if (dir.length() > 0) dir.normalize().multiplyScalar(speed);

        this.velocity.x += (dir.x - this.velocity.x) * (1 - this.damping);
        this.velocity.z += (dir.z - this.velocity.z) * (1 - this.damping);
        this.velocity.y += this.gravity * delta;

        if (this.jumping && this.isOnGround) {
            this.velocity.y = Math.sqrt(2 * this.jumpHeight * Math.abs(this.gravity));
            this.jumping = false;
        }

        // ── Ground collision ──
        const newY = this.camera.position.y + this.velocity.y * delta;
        const groundY = this.groundHeight + this.playerHeight;
        
        if (newY <= groundY) {
            this.camera.position.y = groundY;
            this.velocity.y = 0;
            this.isOnGround = true;
        } else {
            this.camera.position.y = newY;
            this.isOnGround = false;
        }

        // ── 🔥 MOVEMENT WITH COLLISION ──
        const newX = this.camera.position.x + this.velocity.x * delta;
        const newZ = this.camera.position.z + this.velocity.z * delta;

        const canMove = this.canMoveTo(newX, this.camera.position.y, newZ);
        
        if (canMove) {
            this.camera.position.x = newX;
            this.camera.position.z = newZ;
        } else {
            const canMoveX = this.canMoveTo(newX, this.camera.position.y, this.camera.position.z);
            const canMoveZ = this.canMoveTo(this.camera.position.x, this.camera.position.y, newZ);
            
            if (canMoveX) {
                this.camera.position.x = newX;
            } else {
                this.velocity.x = 0;
            }
            
            if (canMoveZ) {
                this.camera.position.z = newZ;
            } else {
                this.velocity.z = 0;
            }
        }

        // ── Stuck detection ──
        // This only makes sense while you're actively trying to move
        // (a direction key held) but not going anywhere — e.g. wedged
        // against furniture. Before, it fired any time position didn't
        // change, which includes just standing still on purpose. That
        // caused a fake "unstuck" teleport up every ~30 frames, which
        // then fell straight back down — the repeating up/down loop.
        const isTryingToMove = this.moveForward || this.moveBackward || this.moveLeft || this.moveRight;
        const currentPos = this.camera.position.clone();
        if (isTryingToMove && currentPos.distanceTo(this.lastPosition) < 0.001) {
            this.stuckCounter++;
            if (this.stuckCounter > 30) {
                const testUp = this.camera.position.clone();
                testUp.y += 0.5;
                if (this.canMoveTo(testUp.x, testUp.y, testUp.z)) {
                    this.camera.position.y = testUp.y;
                }
                this.stuckCounter = 0;
            }
        } else {
            this.stuckCounter = 0;
        }
        this.lastPosition.copy(this.camera.position);
    }

    setGroundHeight(height) {
        this.groundHeight = height;
        this.camera.position.y = height + this.playerHeight;
    }
}