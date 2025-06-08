pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

class PDFViewer {
    constructor() {
        this.pdfDoc = null;
        this.currentPage = 1;
        this.totalPages = 0;
        this.swiper = null;
        this.scale = 1.5;
        this.pdfUrl = '1.pdf';
        this.renderedPages = new Set(); // 记录已渲染的页面
        this.renderingPages = new Set(); // 记录正在渲染的页面
        
        this.init();
    }

    async init() {
        try {
            await this.loadPDF();
            this.initSwiper();
            this.bindEvents();
            this.hideLoader();
        } catch (error) {
            console.error('PDF加载失败:', error);
            this.showError('PDF文件加载失败，请检查文件路径');
        }
    }

    async loadPDF() {
        const loadingTask = pdfjsLib.getDocument(this.pdfUrl);
        this.pdfDoc = await loadingTask.promise;
        this.totalPages = this.pdfDoc.numPages;
        
        document.getElementById('totalPages').textContent = this.totalPages;
        document.getElementById('pageJumpInput').max = this.totalPages;
        
        // 创建所有页面的占位符
        this.createAllSlides();
        // 只渲染第一页
        await this.renderPage(1);
    }

    createAllSlides() {
        const container = document.getElementById('pdfContainer');
        
        for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
            const slide = document.createElement('div');
            slide.className = 'swiper-slide';
            slide.dataset.page = pageNum;
            
            const pageDiv = document.createElement('div');
            pageDiv.className = 'pdf-page';
            pageDiv.id = `page-${pageNum}`;
            
            // 添加加载占位符
            const placeholder = document.createElement('div');
            placeholder.className = 'page-placeholder';
            placeholder.innerHTML = `
                <div class="placeholder-content">
                    <div class="placeholder-spinner"></div>
                    <p>正在加载第 ${pageNum} 页...</p>
                </div>
            `;
            
            pageDiv.appendChild(placeholder);
            slide.appendChild(pageDiv);
            container.appendChild(slide);
        }
    }

    async renderPage(pageNum) {
        if (this.renderedPages.has(pageNum) || this.renderingPages.has(pageNum)) {
            return; // 已渲染或正在渲染
        }

        this.renderingPages.add(pageNum);
        
        try {
            const pageDiv = document.getElementById(`page-${pageNum}`);
            const placeholder = pageDiv.querySelector('.page-placeholder');
            
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            
            const page = await this.pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: this.scale });
            
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };
            
            await page.render(renderContext).promise;
            
            // 渲染完成后替换占位符
            pageDiv.removeChild(placeholder);
            pageDiv.appendChild(canvas);
            
            this.renderedPages.add(pageNum);
            this.renderingPages.delete(pageNum);
            
            // 创建缩略图（仅前10页）
            if (pageNum <= 10) {
                this.createThumbnail(page, pageNum);
            }
            
        } catch (error) {
            console.error(`渲染第${pageNum}页失败:`, error);
            this.renderingPages.delete(pageNum);
        }
    }

    async preloadAdjacentPages(currentPage) {
        // 预加载前后各2页
        const pagesToLoad = [];
        for (let i = Math.max(1, currentPage - 2); i <= Math.min(this.totalPages, currentPage + 2); i++) {
            if (!this.renderedPages.has(i) && !this.renderingPages.has(i)) {
                pagesToLoad.push(i);
            }
        }
        
        // 并行加载这些页面
        Promise.all(pagesToLoad.map(page => this.renderPage(page)));
    }

    async createThumbnail(page, pageNum) {
        const thumbnailContainer = document.getElementById('thumbnailContainer');
        const thumbnailDiv = document.createElement('div');
        thumbnailDiv.className = 'thumbnail';
        thumbnailDiv.dataset.page = pageNum;
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        const viewport = page.getViewport({ scale: 0.2 });
        
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };
        
        await page.render(renderContext).promise;
        
        thumbnailDiv.appendChild(canvas);
        thumbnailContainer.appendChild(thumbnailDiv);
        
        thumbnailDiv.addEventListener('click', () => {
            this.goToPage(pageNum);
        });
    }

    initSwiper() {
        this.swiper = new Swiper('.pdf-swiper', {
            effect: 'coverflow',
            grabCursor: true,
            centeredSlides: true,
            slidesPerView: 'auto',
            spaceBetween: 30,
            coverflowEffect: {
                rotate: 30,
                stretch: 0,
                depth: 100,
                modifier: 1,
                slideShadows: true,
            },
            navigation: {
                nextEl: '.swiper-button-next',
                prevEl: '.swiper-button-prev',
            },
            pagination: {
                el: '.swiper-pagination',
                clickable: true,
                dynamicBullets: true,
            },
            keyboard: {
                enabled: true,
            },
            mousewheel: {
                enabled: true,
                thresholdDelta: 70,
            },
            on: {
                slideChange: () => {
                    this.currentPage = this.swiper.activeIndex + 1;
                    this.updatePageInfo();
                    this.updateThumbnails();
                    // 渲染当前页和预加载相邻页
                    this.renderPage(this.currentPage);
                    this.preloadAdjacentPages(this.currentPage);
                }
            },
            touchRatio: 1,
            touchAngle: 45,
            simulateTouch: true,
            allowTouchMove: true,
        });
    }

    bindEvents() {
        document.getElementById('fullscreenBtn').addEventListener('click', () => {
            this.toggleFullscreen();
        });

        document.getElementById('pageJumpBtn').addEventListener('click', () => {
            const pageNum = parseInt(document.getElementById('pageJumpInput').value);
            if (pageNum >= 1 && pageNum <= this.totalPages) {
                this.goToPage(pageNum);
            }
        });

        document.getElementById('pageJumpInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('pageJumpBtn').click();
            }
        });

        document.addEventListener('keydown', (e) => {
            switch(e.key) {
                case 'ArrowLeft':
                case 'ArrowUp':
                    this.swiper.slidePrev();
                    break;
                case 'ArrowRight':
                case 'ArrowDown':
                    this.swiper.slideNext();
                    break;
                case 'Home':
                    this.goToPage(1);
                    break;
                case 'End':
                    this.goToPage(this.totalPages);
                    break;
                case 'F11':
                    e.preventDefault();
                    this.toggleFullscreen();
                    break;
            }
        });
    }

    goToPage(pageNum) {
        if (pageNum >= 1 && pageNum <= this.totalPages) {
            this.swiper.slideTo(pageNum - 1);
        }
    }

    updatePageInfo() {
        document.getElementById('currentPage').textContent = this.currentPage;
    }

    updateThumbnails() {
        document.querySelectorAll('.thumbnail').forEach(thumb => {
            thumb.classList.remove('active');
        });
        
        const activeThumbnail = document.querySelector(`.thumbnail[data-page="${this.currentPage}"]`);
        if (activeThumbnail) {
            activeThumbnail.classList.add('active');
        }
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.log('无法进入全屏模式:', err);
            });
        } else {
            document.exitFullscreen();
        }
    }

    hideLoader() {
        const loader = document.getElementById('loader');
        loader.classList.add('hidden');
        setTimeout(() => {
            loader.style.display = 'none';
        }, 500);
    }

    showError(message) {
        const loader = document.getElementById('loader');
        loader.innerHTML = `
            <div style="color: #ff6b6b; text-align: center;">
                <h2>❌ 错误</h2>
                <p>${message}</p>
                <button onclick="location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #fff; border: none; border-radius: 5px; cursor: pointer;">
                    重新加载
                </button>
            </div>
        `;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new PDFViewer();
});
