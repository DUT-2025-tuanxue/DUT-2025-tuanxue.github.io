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
            // 立即隐藏加载器并显示界面
            this.hideLoader();
            this.showInitialUI();
            
            // 后台异步加载PDF
            this.loadPDF();
        } catch (error) {
            console.error('初始化失败:', error);
            this.showError('初始化失败，请刷新页面重试');
        }
    }

    showInitialUI() {
        // 先显示一个临时占位符
        this.createTemporarySlide();
        this.initSwiper();
        this.bindEvents();
        
        // 更新UI显示正在加载状态
        document.getElementById('totalPages').textContent = '加载中...';
        document.getElementById('currentPage').textContent = '1';
    }

    createTemporarySlide() {
        const container = document.getElementById('pdfContainer');
        const slide = document.createElement('div');
        slide.className = 'swiper-slide';
        slide.id = 'temp-slide';
        
        const pageDiv = document.createElement('div');
        pageDiv.className = 'pdf-page';
        
        const placeholder = document.createElement('div');
        placeholder.className = 'page-placeholder loading-pdf';
        placeholder.innerHTML = `
            <div class="placeholder-content">
                <div class="placeholder-spinner"></div>
                <p>正在连接PDF文件...</p>
                <div class="loading-progress">
                    <div class="progress-bar"></div>
                </div>
            </div>
        `;
        
        pageDiv.appendChild(placeholder);
        slide.appendChild(pageDiv);
        container.appendChild(slide);
    }

    async loadPDF() {
        try {
            // 显示进度
            this.updateLoadingProgress('正在下载PDF文件...', 10);
            
            const loadingTask = pdfjsLib.getDocument(this.pdfUrl);
            
            // 监听加载进度
            loadingTask.onProgress = (progress) => {
                if (progress.total > 0) {
                    const percent = Math.round((progress.loaded / progress.total) * 60) + 10;
                    this.updateLoadingProgress(`正在下载PDF文件... ${percent}%`, percent);
                }
            };
            
            this.pdfDoc = await loadingTask.promise;
            this.totalPages = this.pdfDoc.numPages;
            
            this.updateLoadingProgress('PDF加载完成，正在准备页面...', 80);
            
            // 更新页面信息
            document.getElementById('totalPages').textContent = this.totalPages;
            document.getElementById('pageJumpInput').max = this.totalPages;
            
            // 移除临时占位符
            const tempSlide = document.getElementById('temp-slide');
            if (tempSlide) {
                tempSlide.remove();
            }
            
            // 创建所有页面的占位符
            this.createAllSlides();
            
            // 重新初始化Swiper
            this.swiper.destroy(true, true);
            this.initSwiper();
            
            this.updateLoadingProgress('正在渲染第一页...', 90);
            
            // 渲染第一页
            await this.renderPage(1);
            
            this.updateLoadingProgress('完成！', 100);
            
            // 预加载前几页
            setTimeout(() => {
                this.preloadAdjacentPages(1);
            }, 500);
            
        } catch (error) {
            console.error('PDF加载失败:', error);
            this.showPDFError('PDF文件加载失败，请检查网络连接或文件路径');
        }
    }

    updateLoadingProgress(message, percent) {
        const placeholder = document.querySelector('.loading-pdf .placeholder-content');
        if (placeholder) {
            const progressText = placeholder.querySelector('p');
            const progressBar = placeholder.querySelector('.progress-bar');
            
            if (progressText) progressText.textContent = message;
            if (progressBar) progressBar.style.width = `${percent}%`;
        }
    }

    showPDFError(message) {
        const container = document.getElementById('pdfContainer');
        container.innerHTML = `
            <div class="swiper-slide">
                <div class="pdf-page">
                    <div class="page-placeholder error">
                        <div class="placeholder-content">
                            <div style="color: #ff6b6b; font-size: 48px; margin-bottom: 20px;">❌</div>
                            <h3 style="color: #ff6b6b; margin-bottom: 15px;">加载失败</h3>
                            <p style="margin-bottom: 20px;">${message}</p>
                            <button onclick="location.reload()" class="retry-btn">
                                重新加载
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // 重新初始化Swiper
        if (this.swiper) {
            this.swiper.destroy(true, true);
            this.initSwiper();
        }
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
        // 智能预加载：当前页前后各1页优先，然后扩展到前后各3页
        const highPriorityPages = [];
        const lowPriorityPages = [];
        
        // 高优先级：前后各1页
        for (let i = Math.max(1, currentPage - 1); i <= Math.min(this.totalPages, currentPage + 1); i++) {
            if (!this.renderedPages.has(i) && !this.renderingPages.has(i)) {
                highPriorityPages.push(i);
            }
        }
        
        // 低优先级：前后各3页（排除已在高优先级中的）
        for (let i = Math.max(1, currentPage - 3); i <= Math.min(this.totalPages, currentPage + 3); i++) {
            if (!this.renderedPages.has(i) && !this.renderingPages.has(i) && !highPriorityPages.includes(i)) {
                lowPriorityPages.push(i);
            }
        }
        
        // 先加载高优先级页面
        if (highPriorityPages.length > 0) {
            await Promise.all(highPriorityPages.map(page => this.renderPage(page)));
        }
        
        // 延迟加载低优先级页面，避免阻塞
        if (lowPriorityPages.length > 0) {
            setTimeout(() => {
                lowPriorityPages.forEach(page => this.renderPage(page));
            }, 1000);
        }
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
