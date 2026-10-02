document.addEventListener('DOMContentLoaded', () => {
    const installBtns = document.querySelectorAll('.nav-cta, .hero-actions .btn-primary');
    const modal = document.getElementById('comingSoonModal');
    const closeBtn = document.querySelector('.close-btn');

    if (installBtns.length > 0 && modal && closeBtn) {
        installBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                modal.style.display = 'block';
            });
        });

        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });

        window.addEventListener('click', (event) => {
            if (event.target == modal) {
                modal.style.display = 'none';
            }
        });
    }

    const howItWorksBtn = document.getElementById('howItWorksBtn');
    if (howItWorksBtn) {
        howItWorksBtn.addEventListener('click', () => {
            const section = document.getElementById('como-funciona');
            if (section) {
                section.scrollIntoView({ behavior: 'smooth' });
            }
        });
    }

    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });
});
