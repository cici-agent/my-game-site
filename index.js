// ===== 首页 - 轮播 & 分类 =====

document.addEventListener('DOMContentLoaded', function() {
  // 轮播自动播放
  const slides = document.querySelectorAll('.banner-slide');
  const dots = document.querySelectorAll('.banner-dots .dot');
  let currentSlide = 0;

  function showSlide(index) {
    slides.forEach(s => s.classList.remove('active'));
    dots.forEach(d => d.classList.remove('active'));
    slides[index].classList.add('active');
    dots[index].classList.add('active');
    currentSlide = index;
  }

  function nextSlide() {
    showSlide((currentSlide + 1) % slides.length);
  }

  // 自动轮播 4秒
  let autoPlay = setInterval(nextSlide, 4000);

  // 点击圆点切换
  dots.forEach(dot => {
    dot.addEventListener('click', function() {
      clearInterval(autoPlay);
      showSlide(parseInt(this.dataset.index));
      autoPlay = setInterval(nextSlide, 4000);
    });
  });

  // 分类导航点击
  const categoryLinks = document.querySelectorAll('.category-list a');
  categoryLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      categoryLinks.forEach(l => l.classList.remove('active'));
      this.classList.add('active');
      // 未来可以根据 data-category 过滤游戏
      const category = this.dataset.category;
      console.log('选择分类:', category);
    });
  });
});
