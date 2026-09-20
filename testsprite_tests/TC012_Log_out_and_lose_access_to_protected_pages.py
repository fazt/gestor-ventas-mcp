import asyncio
import re
from playwright import async_api
from playwright.async_api import expect

async def run_test():
    pw = None
    browser = None
    context = None

    try:
        # Start a Playwright session in asynchronous mode
        pw = await async_api.async_playwright().start()

        # Launch a Chromium browser in headless mode with custom arguments
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,720",
                "--disable-dev-shm-usage",
                "--ipc=host",
                "--single-process"
            ],
        )

        # Create a new browser context (like an incognito window)
        context = await browser.new_context()
        # Wider default timeout to match the agent's DOM-stability budget;
        # auto-waiting Playwright APIs (expect, locator.wait_for) inherit this.
        context.set_default_timeout(15000)

        # Open a new page in the browser context
        page = await context.new_page()

        # Interact with the page elements to simulate user flow
        # -> navigate
        await page.goto("http://localhost:3000/login")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # -> Click the 'Entrar' button to sign in with the admin user
        # Entrar button
        elem = page.get_by_role("button", name="Entrar")
        await elem.click(timeout=10000)
        
        # -> Open the 'Administrador' user menu
        # A Administrador button
        elem = page.get_by_role("button", name="A Administrador")
        await elem.click(timeout=10000)
        
        # -> Click the 'Cerrar sesión' (Log out) menu item from the 'Administrador' user menu to end the session.
        # Cerrar sesión menu item
        elem = page.get_by_role("menuitem", name="Cerrar sesión")
        await elem.click(timeout=10000)
        
        # -> Navigate to the 'Dashboard' page and verify it redirects to the login screen (login form with 'Correo', 'Contraseña', and 'Entrar' visible).
        await page.goto("http://localhost:3000/dashboard")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # --> Assertions to verify final state
        
        # --> After logging out, the login page is shown with the email field pre-filled.
        # Assert-outcome: passed
        # Assert: Email input is pre-filled with the admin address.
        await expect(page.get_by_role("textbox", name="Correo").nth(0)).to_have_value("admin@ventas.com", timeout=15000), "Email input is pre-filled with the admin address."
        await page.get_by_role("button", name="Entrar").nth(0).scroll_into_view_if_needed()
        # Assert-outcome: passed
        # Assert: The 'Entrar' submit button is visible on the login form.
        await expect(page.get_by_role("button", name="Entrar").nth(0)).to_be_visible(timeout=15000), "The 'Entrar' submit button is visible on the login form."
        
        # --> Attempting to navigate to /dashboard redirects to the login page.
        # Assert-outcome: passed
        # Assert: The URL indicates a redirect to the login page after trying to access /dashboard.
        await expect(page).to_have_url(re.compile("/login\\?from=%2Fdashboard"), timeout=15000), "The URL indicates a redirect to the login page after trying to access /dashboard."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    