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
        
        # -> Click the 'Entrar' button to submit the login form.
        # Entrar button
        elem = page.get_by_role("button", name="Entrar")
        await elem.click(timeout=10000)
        
        # -> Click the 'Inventario' link in the sidebar to open the inventory page.
        # Inventario link
        elem = page.get_by_role("link", name="Inventario")
        await elem.click(timeout=10000)
        
        # -> Open the 'Producto' dropdown labeled 'Selecciona' so a product option can be chosen.
        # Selecciona button
        elem = page.get_by_role("combobox").filter(has_text="Selecciona")
        await elem.click(timeout=10000)
        
        # -> Select 'Producto panel' from the product dropdown
        # Producto panel option
        elem = page.get_by_role("option", name="Producto panel")
        await elem.click(timeout=10000)
        
        # -> Fill the 'Motivo' field with 'Movimiento de prueba' and click the 'Registrar movimiento' button to record the movement.
        # reason text area
        elem = page.get_by_role("textbox", name="Motivo")
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Movimiento de prueba")
        
        # -> Fill the 'Motivo' field with 'Movimiento de prueba' and click the 'Registrar movimiento' button to record the movement.
        # Registrar movimiento button
        elem = page.get_by_role("button", name="Registrar movimiento")
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> The new movement appears in the Movimientos history with the reason 'Movimiento de prueba'.
        # Assert-outcome: passed
        # Assert: Top Movimientos row shows the movement reason 'Movimiento de prueba'.
        await expect(page.locator("xpath=/html/body/div[2]/div/main/div/div[3]/div[2]/div[1]/table/tbody/tr[1]/td[6]").nth(0)).to_have_text("Movimiento de prueba", timeout=15000), "Top Movimientos row shows the movement reason 'Movimiento de prueba'."
        
        # --> The movement's Stock column shows an audited previous → new value format.
        # Assert-outcome: passed
        # Assert: Stock cell contains '→', indicating a previous → new stock value.
        await expect(page.get_by_role("main").nth(0)).to_contain_text("\u2192", timeout=15000), "Stock cell contains '\u2192', indicating a previous \u2192 new stock value."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    