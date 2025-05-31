(function() {
  const lightboxPlugin = (hook, vm) => {
    // Variables needed for navigation
    let currentLightboxImage = null;
    
    // Add lightbox HTML to the document
    hook.mounted(() => {
      const lightbox = document.createElement('div');
      lightbox.id = 'image-lightbox';
      lightbox.className = 'lightbox';
      lightbox.innerHTML = `
        <div class="lightbox-caption"></div>
        <div class="lightbox-content">
          <div class="lightbox-loading"></div>
          <img src="" alt="" class="lightbox-image">
        </div>
        <div class="lightbox-controls">
          <button class="lightbox-prev" aria-label="Previous image">&lsaquo;</button>
          <button class="lightbox-close" aria-label="Close lightbox">&times;</button>
          <a class="lightbox-download" aria-label="Download image" download>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </a>
          <button class="lightbox-next" aria-label="Next image">&rsaquo;</button>
        </div>
      `;
      document.body.appendChild(lightbox);

      let inactivityTimer;
      
      // Function to show UI controls
      function showControls() {
        clearTimeout(inactivityTimer);
        const controls = document.querySelector('.lightbox-controls');
        const caption = document.querySelector('.lightbox-caption');
        
        controls.classList.remove('fade-out');
        caption.classList.remove('fade-out');
        
        // Set timer to hide controls after 2 seconds of inactivity
        inactivityTimer = setTimeout(() => {
          if (lightbox.classList.contains('active')) {
            controls.classList.add('fade-out');
            caption.classList.add('fade-out');
          }
        }, 2000);
      }
      
      // Show controls on mouse movement or touch
      lightbox.addEventListener('mousemove', showControls);
      lightbox.addEventListener('touchstart', showControls);
      
      // Add event listener to close lightbox
      document.querySelector('.lightbox-close').addEventListener('click', () => {
        closeLightbox();
      });
      
      // Close on clicking outside the image
      lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) {
          closeLightbox();
        }
      });

      // Add keyboard navigation
      document.addEventListener('keydown', (e) => {
        if (!lightbox.classList.contains('active')) return;
        
        if (e.key === 'Escape') {
          closeLightbox();
        } else if (e.key === 'ArrowLeft') {
          navigateImages('prev');
        } else if (e.key === 'ArrowRight') {
          navigateImages('next');
        }
      });

      // Improve touch gesture handling for mobile
      let touchStartX = 0;
      let touchStartY = 0;
      let touchEndX = 0;
      let touchEndY = 0;
      let initialPinchDistance = 0;
      let initialPinchCenter = { x: 0, y: 0 };
      let imageScale = 1;
      let imageTranslateX = 0;
      let imageTranslateY = 0;
      let isDragging = false;
      let lastTouchX = 0;
      let lastTouchY = 0;
      let isZooming = false;
      let zoomDebounceTimer = null;
      let previousScale = 1;
      let startScale = 1;
      let lastPinchCenter = { x: 0, y: 0 };
      let rafId = null;
      
      // Calculate center point between two touches
      function getTouchCenter(touches) {
        return {
          x: (touches[0].clientX + touches[1].clientX) / 2,
          y: (touches[0].clientY + touches[1].clientY) / 2
        };
      }
      
      // Handle touch start
      lightbox.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
          // Single touch - potential swipe or drag
          touchStartX = e.touches[0].screenX;
          touchStartY = e.touches[0].screenY;
          lastTouchX = touchStartX;
          lastTouchY = touchStartY;
          
          // Check if we're on the image (for dragging when zoomed)
          const touch = e.touches[0];
          const lightboxImg = document.querySelector('.lightbox-image');
          const imgRect = lightboxImg.getBoundingClientRect();
          
          if (touch.clientX >= imgRect.left && touch.clientX <= imgRect.right &&
              touch.clientY >= imgRect.top && touch.clientY <= imgRect.bottom &&
              imageScale > 1) {
            isDragging = true;
            
            // Remove transition for dragging to make it instant
            lightboxImg.style.transition = 'none';
          }
        } else if (e.touches.length === 2) {
          // Pinch gesture (two touches)
          e.preventDefault();
          
          // Cancel any running animation
          if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
          }
          
          const lightboxImg = document.querySelector('.lightbox-image');
          const imgRect = lightboxImg.getBoundingClientRect();
          
          initialPinchDistance = getPinchDistance(e.touches);
          initialPinchCenter = getTouchCenter(e.touches);
          lastPinchCenter = initialPinchCenter;
          
          // Calculate pinch center relative to image
          const relativeX = (initialPinchCenter.x - imgRect.left) / imgRect.width;
          const relativeY = (initialPinchCenter.y - imgRect.top) / imgRect.height;
          
          // Store these for pinch center adjustment
          lightboxImg.dataset.pinchCenterX = relativeX;
          lightboxImg.dataset.pinchCenterY = relativeY;
          
          isDragging = false;
          isZooming = true;
          startScale = imageScale;
          previousScale = imageScale;
          
          // Remove transition for zooming to make it snappier
          lightboxImg.style.transition = 'none';
        }
        
        // Show controls on touch
        showControls();
      }, {passive: false});
      
      // Handle touch move
      lightbox.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
          // Handle pinch zoom with improved native feel
          e.preventDefault();
          
          // Use requestAnimationFrame for smoother performance
          if (rafId) {
            cancelAnimationFrame(rafId);
          }
          
          rafId = requestAnimationFrame(() => {
            const lightboxImg = document.querySelector('.lightbox-image');
            const imgRect = lightboxImg.getBoundingClientRect();
            
            // Get current distance and center
            const currentDistance = getPinchDistance(e.touches);
            const currentCenter = getTouchCenter(e.touches);
            
            // Calculate pinch ratio with slight elasticity at extremes
            let pinchRatio = currentDistance / initialPinchDistance;
            
            // Apply elasticity when approaching limits
            const targetScale = startScale * pinchRatio;
            if (targetScale < 1) {
              pinchRatio = 1 / startScale + (pinchRatio - 1 / startScale) * 0.3;
            } else if (targetScale > 4) {
              pinchRatio = 4 / startScale - (4 / startScale - pinchRatio) * 0.3;
            }
            
            // Calculate new scale with rubber-banding at limits
            const newScale = Math.max(0.8, Math.min(4.5, startScale * pinchRatio));
            
            // Get the pinch center relative to image
            const relativeX = parseFloat(lightboxImg.dataset.pinchCenterX) || 0.5;
            const relativeY = parseFloat(lightboxImg.dataset.pinchCenterY) || 0.5;
            
            // Calculate how the image dimensions changed
            const scaleChange = newScale / imageScale;
            const oldWidth = imgRect.width;
            const oldHeight = imgRect.height;
            const newWidth = oldWidth * scaleChange;
            const newHeight = oldHeight * scaleChange;
            
            // Adjust translation based on pinch center movement
            const centerDeltaX = currentCenter.x - lastPinchCenter.x;
            const centerDeltaY = currentCenter.y - lastPinchCenter.y;
            
            // Update translation to keep pinch center stable
            imageTranslateX += centerDeltaX;
            imageTranslateY += centerDeltaY;
            
            // Additional adjustment for scale change around pinch center
            imageTranslateX -= (newWidth - oldWidth) * (relativeX - 0.5);
            imageTranslateY -= (newHeight - oldHeight) * (relativeY - 0.5);
            
            // Apply scale and translation with constraint
            if (newScale >= 1) {
              // Apply constraints only when zoomed in
              const maxTranslateX = (newScale - 1) * lightboxImg.width / 2;
              const maxTranslateY = (newScale - 1) * lightboxImg.height / 2;
              
              // More forgiving constraints with elasticity
              if (Math.abs(imageTranslateX) > maxTranslateX) {
                imageTranslateX = Math.sign(imageTranslateX) * (maxTranslateX + (Math.abs(imageTranslateX) - maxTranslateX) * 0.3);
              }
              
              if (Math.abs(imageTranslateY) > maxTranslateY) {
                imageTranslateY = Math.sign(imageTranslateY) * (maxTranslateY + (Math.abs(imageTranslateY) - maxTranslateY) * 0.3);
              }
            } else {
              // When zoomed out less than 1, center the image
              imageTranslateX *= 0.8;
              imageTranslateY *= 0.8;
            }
            
            // Apply transform with hardware acceleration
            lightboxImg.style.transform = `translate3d(${imageTranslateX}px, ${imageTranslateY}px, 0) scale(${newScale})`;
            imageScale = newScale;
            
            // Store values for next frame
            lastPinchCenter = currentCenter;
            
            rafId = null;
          });
        } else if (e.touches.length === 1 && isDragging && imageScale > 1) {
          // Handle dragging the zoomed image
          e.preventDefault();
          
          const touch = e.touches[0];
          const deltaX = touch.screenX - lastTouchX;
          const deltaY = touch.screenY - lastTouchY;
          
          imageTranslateX += deltaX;
          imageTranslateY += deltaY;
          
          // Apply constraints to prevent dragging too far
          const lightboxImg = document.querySelector('.lightbox-image');
          const maxTranslateX = (imageScale - 1) * lightboxImg.width / 2;
          const maxTranslateY = (imageScale - 1) * lightboxImg.height / 2;
          
          imageTranslateX = Math.min(maxTranslateX, Math.max(-maxTranslateX, imageTranslateX));
          imageTranslateY = Math.min(maxTranslateY, Math.max(-maxTranslateY, imageTranslateY));
          
          lightboxImg.style.transform = `translate(${imageTranslateX}px, ${imageTranslateY}px) scale(${imageScale})`;
          
          lastTouchX = touch.screenX;
          lastTouchY = touch.screenY;
        }
      }, {passive: false});
      
      // Handle touch end with momentum effect
      lightbox.addEventListener('touchend', (e) => {
        // Cancel any running animation
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        
        // Restore transition for smoother end of gesture
        const lightboxImg = document.querySelector('.lightbox-image');
        lightboxImg.style.transition = 'transform 0.3s cubic-bezier(0.23, 1, 0.32, 1)';
        
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        
        // Elastic snapback if we're outside allowed scale range
        if (imageScale < 1) {
          // Animate back to scale 1 with a nice elastic feel
          imageScale = 1;
          imageTranslateX = 0;
          imageTranslateY = 0;
          lightboxImg.style.transform = `translate3d(0, 0, 0) scale(1)`;
        } else if (imageScale > 4) {
          // Animate back to max scale
          imageScale = 4;
          
          // Apply constraints
          const maxTranslateX = (imageScale - 1) * lightboxImg.width / 2;
          const maxTranslateY = (imageScale - 1) * lightboxImg.height / 2;
          
          imageTranslateX = Math.min(maxTranslateX, Math.max(-maxTranslateX, imageTranslateX));
          imageTranslateY = Math.min(maxTranslateY, Math.max(-maxTranslateY, imageTranslateY));
          
          lightboxImg.style.transform = `translate3d(${imageTranslateX}px, ${imageTranslateY}px, 0) scale(${imageScale})`;
        }
        
        // Only handle swipe if not zoomed, not dragging, and not recently zooming
        if (imageScale === 1 && !isDragging && !isZooming) {
          handleSwipe();
        }
        
        // Clear the zoom flag after a short delay to prevent accidental swipes
        // But make it shorter for better responsiveness
        if (isZooming) {
          clearTimeout(zoomDebounceTimer);
          zoomDebounceTimer = setTimeout(() => {
            isZooming = false;
          }, 200); // Reduced from 300ms
        }
        
        // Reset dragging flag
        isDragging = false;
        
        // If scale is very close to 1, snap it exactly to 1
        if (imageScale < 1.05 && imageScale > 0.95) {
          resetZoom();
        }
      }, {passive: true});
      
      // Double tap to zoom with better feel
      let lastTap = 0;
      let lastTapX = 0;
      let lastTapY = 0;
      
      lightbox.addEventListener('touchend', (e) => {
        if (e.touches.length > 0) return; // Only process when all fingers are lifted
        
        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTap;
        
        // Check if it's a double tap (300ms or less between taps)
        if (tapLength < 300 && tapLength > 0) {
          const touch = e.changedTouches[0];
          const lightboxImg = document.querySelector('.lightbox-image');
          const imgRect = lightboxImg.getBoundingClientRect();
          
          // Only double-tap zoom if touching the image
          if (touch.clientX >= imgRect.left && touch.clientX <= imgRect.right &&
              touch.clientY >= imgRect.top && touch.clientY <= imgRect.bottom) {
            e.preventDefault();
            
            // Calculate tap position relative to image
            const relativeX = (touch.clientX - imgRect.left) / imgRect.width;
            const relativeY = (touch.clientY - imgRect.top) / imgRect.height;
            
            // Set transition for smooth zoom effect
            lightboxImg.style.transition = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            
            if (imageScale === 1) {
              // Zoom in to the tap point
              imageScale = 2.5;  // More natural zoom level
              
              // Calculate position to zoom to tap point
              imageTranslateX = (imgRect.width / 2) - (touch.clientX - imgRect.left) * 2.5;
              imageTranslateY = (imgRect.height / 2) - (touch.clientY - imgRect.top) * 2.5;
              
              // Apply constraints
              const maxTranslateX = (imageScale - 1) * lightboxImg.width / 2;
              const maxTranslateY = (imageScale - 1) * lightboxImg.height / 2;
              
              imageTranslateX = Math.min(maxTranslateX, Math.max(-maxTranslateX, imageTranslateX));
              imageTranslateY = Math.min(maxTranslateY, Math.max(-maxTranslateY, imageTranslateY));
              
              lightboxImg.style.transform = `translate3d(${imageTranslateX}px, ${imageTranslateY}px, 0) scale(${imageScale})`;
            } else {
              // Reset zoom with animation
              resetZoom();
            }
          }
        }
        
        // Store data for next tap
        lastTap = currentTime;
        if (e.changedTouches.length > 0) {
          lastTapX = e.changedTouches[0].clientX;
          lastTapY = e.changedTouches[0].clientY;
        }
      });
      
      // Calculate distance between two touch points (for pinch) - optimized
      function getPinchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
      }
      
      // Handle swipe gestures
      function handleSwipe() {
        const swipeThreshold = 50;
        const horizontalSwipe = Math.abs(touchEndX - touchStartX);
        const verticalSwipe = Math.abs(touchEndY - touchStartY);
        
        // Only trigger horizontal swipe if it's more horizontal than vertical
        if (horizontalSwipe > verticalSwipe && horizontalSwipe > swipeThreshold) {
          if (touchEndX < touchStartX) {
            // Swipe left, go to next
            navigateImages('next');
          } else {
            // Swipe right, go to prev
            navigateImages('prev');
          }
        }
      }

      // Add mouse wheel zoom for desktop
      let wheelTimeout = null;
      let lastWheelTime = 0;
      let zoomVelocity = 0;
      let zoomAnimationFrame = null;
      
      lightbox.addEventListener('wheel', (e) => {
        if (!lightbox.classList.contains('active')) return;
        
        e.preventDefault();
        
        const lightboxImg = document.querySelector('.lightbox-image');
        const imgRect = lightboxImg.getBoundingClientRect();
        
        // Check if mouse is over the image
        if (e.clientX >= imgRect.left && e.clientX <= imgRect.right &&
            e.clientY >= imgRect.top && e.clientY <= imgRect.bottom) {
          
          // Remove transition for instant response
          lightboxImg.style.transition = 'none';
          
          // Get mouse position relative to image
          const mouseX = e.clientX - imgRect.left;
          const mouseY = e.clientY - imgRect.top;
          
          // Calculate position percentage (0 to 1)
          const percentX = mouseX / imgRect.width;
          const percentY = mouseY / imgRect.height;
          
          // Determine zoom direction and adjust velocity with adaptive zoom speed
          const now = Date.now();
          const timeDelta = now - lastWheelTime;
          lastWheelTime = now;
          
          // Adjust zoom factor based on current scale for smoother feel
          // Lower zoom factor when at extreme zoom levels
          const currentZoomFactor = 0.1 * (1 - Math.abs(imageScale - 2.5) / 3);
          
          // Calculate velocity with smoothing
          const rawDelta = Math.sign(-e.deltaY) * currentZoomFactor;
          
          // Smooth zoom velocity with exponential decay
          if (timeDelta < 200) {
            zoomVelocity = zoomVelocity * 0.7 + rawDelta * 0.3;
          } else {
            zoomVelocity = rawDelta;
          }
          
          // Apply zoom with velocity
          applySmoothedZoom(zoomVelocity, lightboxImg, percentX, percentY);
          
          // Update cursor based on zoom level
          if (imageScale > 1) {
            lightboxImg.classList.add('zoomed');
          } else {
            lightboxImg.classList.remove('zoomed');
          }
          
          // Show controls when zooming
          showControls();
          
          // Clear any previous timeout
          clearTimeout(wheelTimeout);
          
          // Set a timeout to re-enable transitions after zooming stops
          wheelTimeout = setTimeout(() => {
            lightboxImg.style.transition = '';
            
            // If scale is very close to 1, snap it exactly to 1
            if (imageScale < 1.05 && imageScale > 0.95) {
              resetZoom();
            }
          }, 200);
        }
      }, { passive: false });
      
      // Smooth zoom application function
      function applySmoothedZoom(velocity, lightboxImg, percentX, percentY) {
        // Calculate new scale with limits and smooth acceleration
        const prevScale = imageScale;
        let newScale = Math.max(1, Math.min(4, prevScale + velocity));
        
        if (newScale !== prevScale) {
          // When zooming in/out, adjust position to keep mouse point fixed
          if (newScale > 1) {
            // Calculate how much the image dimensions will change
            const imgRect = lightboxImg.getBoundingClientRect();
            const scaleRatio = newScale / prevScale;
            
            // More accurate calculation of how the image will grow/shrink
            const deltaWidth = imgRect.width * (scaleRatio - 1);
            const deltaHeight = imgRect.height * (scaleRatio - 1);
            
            // Adjust translation with improved accuracy
            imageTranslateX -= (deltaWidth * percentX) - (deltaWidth / 2);
            imageTranslateY -= (deltaHeight * percentY) - (deltaHeight / 2);
            
            // Apply constraints to prevent dragging too far with smoothing
            const maxTranslateX = (newScale - 1) * lightboxImg.width / 2;
            const maxTranslateY = (newScale - 1) * lightboxImg.height / 2;
            
            // Smooth constraint application
            imageTranslateX = Math.min(maxTranslateX, Math.max(-maxTranslateX, imageTranslateX));
            imageTranslateY = Math.min(maxTranslateY, Math.max(-maxTranslateY, imageTranslateY));
          } else {
            // Reset position when zooming back to 1 with smooth motion
            const resetRatio = Math.max(0, (newScale - 1) / (prevScale - 1) || 0);
            imageTranslateX *= resetRatio;
            imageTranslateY *= resetRatio;
          }
          
          // Apply the new scale
          lightboxImg.style.transform = `translate(${imageTranslateX}px, ${imageTranslateY}px) scale(${newScale})`;
          imageScale = newScale;
        }
      }

      // Add mouse drag support for desktop when zoomed
      let isDraggingMouse = false;
      let mouseLastX = 0;
      let mouseLastY = 0;
      
      lightbox.addEventListener('mousedown', (e) => {
        const lightboxImg = document.querySelector('.lightbox-image');
        const imgRect = lightboxImg.getBoundingClientRect();
        
        // Only enable dragging when clicked on the image and zoomed in
        if (e.target === lightboxImg && imageScale > 1) {
          e.preventDefault();
          isDraggingMouse = true;
          mouseLastX = e.clientX;
          mouseLastY = e.clientY;
          
          // Remove transition for smoother dragging
          lightboxImg.style.transition = 'none';
          
          // Show cursor style
          lightboxImg.style.cursor = 'grabbing';
        }
      });
      
      document.addEventListener('mousemove', (e) => {
        if (isDraggingMouse) {
          const deltaX = e.clientX - mouseLastX;
          const deltaY = e.clientY - mouseLastY;
          
          imageTranslateX += deltaX;
          imageTranslateY += deltaY;
          
          // Apply constraints to prevent dragging too far
          const lightboxImg = document.querySelector('.lightbox-image');
          const maxTranslateX = (imageScale - 1) * lightboxImg.width / 2;
          const maxTranslateY = (imageScale - 1) * lightboxImg.height / 2;
          
          imageTranslateX = Math.min(maxTranslateX, Math.max(-maxTranslateX, imageTranslateX));
          imageTranslateY = Math.min(maxTranslateY, Math.max(-maxTranslateY, imageTranslateY));
          
          lightboxImg.style.transform = `translate(${imageTranslateX}px, ${imageTranslateY}px) scale(${imageScale})`;
          
          mouseLastX = e.clientX;
          mouseLastY = e.clientY;
          
          // Show controls when dragging
          showControls();
        }
      });
      
      document.addEventListener('mouseup', () => {
        if (isDraggingMouse) {
          isDraggingMouse = false;
          
          // Restore transition
          const lightboxImg = document.querySelector('.lightbox-image');
          lightboxImg.style.transition = '';
          lightboxImg.style.cursor = '';
        }
      });
      
      // Update resetZoom function for smoother animation
      function resetZoom() {
        imageScale = 1;
        imageTranslateX = 0;
        imageTranslateY = 0;
        previousScale = 1;
        startScale = 1;
        
        const lightboxImg = document.querySelector('.lightbox-image');
        lightboxImg.style.transition = 'transform 0.3s cubic-bezier(0.23, 1, 0.32, 1)';
        lightboxImg.style.transform = 'translate3d(0, 0, 0) scale(1)';
        lightboxImg.style.cursor = '';
      }

      function closeLightbox() {
        lightbox.classList.remove('active');
        document.body.style.overflow = '';
        clearTimeout(inactivityTimer);
        resetZoom();
      }

      // Function to navigate between images - defined once here for global access
      function navigateImages(direction) {
        // Reset zoom when navigating
        resetZoom();
        
        // Show controls when navigating
        showControls();
        
        const lightboxImg = document.querySelector('.lightbox-image');
        currentLightboxImage = lightboxImg; // Store current image reference
        
        // Improved smooth fade transition
        lightboxImg.classList.add('lightbox-fade');
        
        setTimeout(() => {
          // Get all images
          const images = Array.from(document.querySelectorAll('.markdown-section img'))
            .filter(img => !img.closest('a'));
          
          if (images.length === 0) return;
          
          const currentSrc = lightboxImg.getAttribute('src');
          const currentIndex = images.findIndex(img => img.src === currentSrc);
          
          let newIndex;
          if (direction === 'prev') {
            newIndex = (currentIndex - 1 + images.length) % images.length;
          } else {
            newIndex = (currentIndex + 1) % images.length;
          }
          
          // Show loading indicator
          lightbox.classList.add('loading');
          
          // Preload the image
          const tempImg = new Image();
          tempImg.onload = function() {
            lightboxImg.src = images[newIndex].src;
            document.querySelector('.lightbox-caption').textContent = images[newIndex].alt;
            
            // Update download link
            const downloadBtn = document.querySelector('.lightbox-download');
            downloadBtn.href = images[newIndex].src;
            downloadBtn.setAttribute('download', images[newIndex].alt || 'image');
            
            lightbox.classList.remove('loading');
            
            // Fade in the new image
            setTimeout(() => {
              lightboxImg.classList.remove('lightbox-fade');
              lightboxImg.classList.add('lightbox-fade-in');
            }, 50);
          };
          tempImg.src = images[newIndex].src;
        }, 150);
      }

      // Make navigateImages globally available to the plugin
      lightboxPlugin.navigateImages = navigateImages;

      // Remove any previous instance of the navigateImages function to avoid duplicates
      if (typeof navigateImages === 'function') {
        // Remove old function
      }
      
      function closeLightbox() {
        lightbox.classList.remove('active');
        document.body.style.overflow = '';
        clearTimeout(inactivityTimer);
        resetZoom();
      }
    });

    // Process images after each page load
    hook.doneEach(() => {
      // Get all images that aren't inside links
      const images = Array.from(document.querySelectorAll('.markdown-section img'))
        .filter(img => !img.closest('a'));
      
      if (images.length === 0) return;

      // Set up lightbox navigation using the global function
      document.querySelector('.lightbox-prev').addEventListener('click', () => {
        lightboxPlugin.navigateImages('prev');
      });

      document.querySelector('.lightbox-next').addEventListener('click', () => {
        lightboxPlugin.navigateImages('next');
      });

      // Function to toggle navigation buttons visibility based on image count
      function toggleNavigationButtons(show) {
        const prevBtn = document.querySelector('.lightbox-prev');
        const nextBtn = document.querySelector('.lightbox-next');
        
        if (show) {
          prevBtn.style.display = '';
          nextBtn.style.display = '';
        } else {
          prevBtn.style.display = 'none';
          nextBtn.style.display = 'none';
        }
      }

      // Toggle navigation buttons based on the number of images
      toggleNavigationButtons(images.length > 1);

      // Add click listeners to all standalone images
      images.forEach(img => {
        img.style.cursor = 'zoom-in';
        img.addEventListener('click', () => {
          const lightbox = document.getElementById('image-lightbox');
          const lightboxImg = document.querySelector('.lightbox-image');
          
          // FIX: Don't add fade class before showing the image initially
          // Reset classes without adding fade initially
          lightboxImg.classList.remove('lightbox-fade');
          lightboxImg.classList.remove('lightbox-fade-in');
          
          // Show loading indicator
          lightbox.classList.add('loading');
          
          // Set src directly first to fix black screen issue
          lightboxImg.src = img.src;
          
          // Show lightbox immediately 
          lightbox.classList.add('active');
          
          // Set caption
          document.querySelector('.lightbox-caption').textContent = img.alt;
          
          // Set download link
          const downloadBtn = document.querySelector('.lightbox-download');
          downloadBtn.href = img.src;
          downloadBtn.setAttribute('download', img.alt || 'image');
          
          // Remove loading indicator
          lightbox.classList.remove('loading');
          
          // Toggle navigation buttons based on image count
          toggleNavigationButtons(images.length > 1);
          
          // Add fade-in class after a short delay to ensure image is visible
          setTimeout(() => {
            lightboxImg.classList.add('lightbox-fade-in');
          }, 10);
          
          // Prevent body scrolling while lightbox is open
          document.body.style.overflow = 'hidden';
          
          // Show controls initially, then fade out
          const controls = document.querySelector('.lightbox-controls');
          const caption = document.querySelector('.lightbox-caption');
          controls.classList.remove('fade-out');
          caption.classList.remove('fade-out');
          
          // Trigger the inactivity timer
          setTimeout(() => {
            if (lightbox.classList.contains('active')) {
              controls.classList.add('fade-out');
              caption.classList.add('fade-out');
            }
          }, 2000);
        });
      });
    });
  };

  // Register plugin with docsify
  window.$docsify = window.$docsify || {};
  window.$docsify.plugins = window.$docsify.plugins || [];
  window.$docsify.plugins.push(lightboxPlugin);
})();