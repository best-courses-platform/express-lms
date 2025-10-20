/// <reference lib="dom" />
const initializeAuthForm = (): void => {
    const emailSection = document.getElementById('emailAuthSection') as HTMLElement | null;
    const showEmailBtn = document.getElementById('showEmailForm') as HTMLButtonElement | null;
    const showOAuthBtn = document.getElementById('showOAuthForm') as HTMLButtonElement | null;
    const oauthButtons = document.querySelector('.oauth-buttons') as HTMLElement | null;
    const authDivider = document.querySelector('.auth-divider') as HTMLElement | null;

    if (!emailSection || !showEmailBtn || !showOAuthBtn || !oauthButtons || !authDivider) {
        console.warn('Auth form elements not found');
        
        return;
    }

    const showEmailForm = (): void => {
        // Скрываем OAuth элементы
        oauthButtons.style.display = 'none';
        authDivider.style.display = 'none';
        showEmailBtn.style.display = 'none';

        // Показываем форму и кнопку OAuth
        emailSection.style.display = 'block';
        showOAuthBtn.style.display = 'block';

        animateFormAppearance(emailSection);
    };

    const showOAuthForm = (): void => {
        // Показываем OAuth элементы
        oauthButtons.style.display = 'flex';
        authDivider.style.display = 'flex';
        showEmailBtn.style.display = 'block';

        // Скрываем форму и кнопку OAuth
        emailSection.style.display = 'none';
        showOAuthBtn.style.display = 'none';
    };

    const animateFormAppearance = (element: HTMLElement): void => {
        element.style.opacity = '0';
        element.style.transform = 'translateY(10px)';

        requestAnimationFrame(() => {
            element.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            element.style.opacity = '1';
            element.style.transform = 'translateY(0)';
        });
    };

    // Обработчики событий
    showEmailBtn.addEventListener('click', (event: Event) => {
        event.preventDefault();
        showEmailForm();
    });

    showOAuthBtn.addEventListener('click', (event: Event) => {
        event.preventDefault();
        showOAuthForm();
    });
};

document.addEventListener('DOMContentLoaded', () => {
    initializeAuthForm();
});

export { initializeAuthForm };