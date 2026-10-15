document.querySelectorAll(".home-navbar").forEach((navbar) => {
    const toggle = navbar.querySelector(".home-navbar__toggle");
    const menu = navbar.querySelector(".home-navbar__menu");

    if (!toggle || !menu) {
        return;
    }

    toggle.addEventListener("click", () => {
        const isExpanded = toggle.getAttribute("aria-expanded") === "true";
        toggle.classList.toggle("is-active", !isExpanded);
        menu.classList.toggle("is-active", !isExpanded);
        toggle.setAttribute("aria-expanded", String(!isExpanded));
    });

    menu.querySelectorAll(".home-navbar__link").forEach((link) => {
        link.addEventListener("click", () => {
            toggle.classList.remove("is-active");
            menu.classList.remove("is-active");
            toggle.setAttribute("aria-expanded", "false");
        });
    });
});
