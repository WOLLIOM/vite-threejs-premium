import * as THREE from 'three';

export class PlayerController {
    constructor(camera, domElement, groundHeight = 0) {
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
        this.camera.position.y = this.playerHeight + this.groundHeight;

        // Pointer lock
        this.isLocked = false;
        this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
        this.pitchMin = -Math.PI / 2 + 0.1;
        this.pitchMax = Math.PI / 2 - 0.1;

        // Touch controls (mobile)
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.touchMoveX = 0;
        this.touchMoveY = 0;
        this.isTouching = false;

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

    enable() {
        document.addEventListener('keydown', this.onKeyDown);
        document.addEventListener('keyup', this.onKeyUp);
        document.addEventListener('mousemove', this.onMouseMove);
        document.addEventListener('pointerlockchange', this.onLockChange);
        this.domElement.addEventListener('click', this.onClick);
        
        // Mobile support
        this.domElement.addEventListener('touchstart', this.onTouchStart, { passive: true });
        this.domElement.addEventListener('touchmove', this.onTouchMove, { passive: true });
        this.domElement.addEventListener('touchend', this.onTouchEnd, { passive: true });
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
        if (document.pointerLockElement) document.exitPointerLock();
    }

    // ── Desktop Controls ──
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

    // ── Mobile Controls ──
    onTouchStart(e) {
        const touch = e.touches[0];
        if (touch) {
            this.touchStartX = touch.clientX;
            this.touchStartY = touch.clientY;
            this.isTouching = true;
            
            // Try to lock pointer on mobile (works in some browsers)
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
            
            // Move forward/backward based on touch position
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;
            const distX = (touch.clientX - centerX) / centerX;
            const distY = (touch.clientY - centerY) / centerY;
            
            if (distY < -0.3) this.moveForward = true;
            else this.moveForward = false;
            
            if (distY > 0.3) this.moveBackward = true;
            else this.moveBackward = false;
        }
    }

    onTouchEnd() {
        this.isTouching = false;
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
    }

    // ── Keyboard Controls ──
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

    // ── Update ──
    update(delta = 1/60) {
        if (!this.isLocked) return;

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

        // Ground collision
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

        // Move horizontally with simple collision
        const newX = this.camera.position.x + this.velocity.x * delta;
        const newZ = this.camera.position.z + this.velocity.z * delta;
        
        // Simple wall collision - check if position is valid
        // You can expand this with more sophisticated collision
        this.camera.position.x = newX;
        this.camera.position.z = newZ;
    }

    // Update ground height (called when model loads)
    setGroundHeight(height) {
        this.groundHeight = height;
        this.camera.position.y = height + this.playerHeight;
    }
}