/**
 * Add copy buttons and language badges to code blocks
 */
function enhanceCodeBlocks(): void {
  const codeBlocks = document.querySelectorAll("pre > code");

  codeBlocks.forEach((codeBlock) => {
    const pre = codeBlock.parentElement;
    if (!pre) return;

    // Create copy button
    const copyButton = document.createElement("button");
    copyButton.className = "code-copy-button";
    copyButton.textContent = "Copy";
    copyButton.setAttribute("aria-label", "Copy code to clipboard");

    copyButton.addEventListener("click", async () => {
      const code = codeBlock.textContent || "";

      try {
        await navigator.clipboard.writeText(code);
        copyButton.textContent = "Copied!";
        copyButton.classList.add("copied");

        setTimeout(() => {
          copyButton.textContent = "Copy";
          copyButton.classList.remove("copied");
        }, 2000);
      } catch (err) {
        console.error("Failed to copy code:", err);
        copyButton.textContent = "Error";

        setTimeout(() => {
          copyButton.textContent = "Copy";
        }, 2000);
      }
    });

    pre.insertBefore(copyButton, codeBlock);
  });
}

function setActiveNavLink(): void {
  const {
    location: { pathname },
  } = window;

  let path = pathname.split("/")[1];

  if (path.length === 0) {
    path = "/";
  }

  const getClass = (): string => {
    if (path === "/") {
      return "home";
    }

    if (path === "posts") {
      return "posts";
    }

    if (path === "projects") {
      return "projects";
    }

    if (path === "about") {
      return "about";
    }

    if (path === "reading") {
      return "reading";
    }

    if (path === "work") {
      return "work";
    }

    return "";
  };

  const currentPage: HTMLElement | null = document.querySelector(
    `#nav > .nav--link.${getClass()}`
  );
  currentPage?.classList.add("active");
}

function wireMobileNav(): void {
  const trigger = document.getElementById("mobile-nav-trigger");
  const nav = document.getElementById("nav");

  if (!(trigger instanceof HTMLElement) || !(nav instanceof HTMLElement)) {
    return;
  }

  const setOpen = (open: boolean): void => {
    trigger.classList.toggle("active", open);
    nav.classList.toggle("open", open);
    document.body.classList.toggle("fixed", open);
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
    trigger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  };

  const toggle = (): void => {
    setOpen(!trigger.classList.contains("active"));
  };

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    toggle();
  });

  nav.querySelectorAll(".nav--link").forEach((link) => {
    link.addEventListener("click", () => {
      setOpen(false);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && trigger.classList.contains("active")) {
      setOpen(false);
      trigger.focus();
    }
  });
}

function main(): void {
  setActiveNavLink();
  document.body.classList.remove("hidden");
  enhanceCodeBlocks();
  wireMobileNav();
}

window.addEventListener("load", main);
