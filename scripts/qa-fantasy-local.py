from playwright.sync_api import sync_playwright
from pathlib import Path
import subprocess,time,sys,json
root=Path(__file__).resolve().parent.parent
server=subprocess.Popen(['python3','-m','http.server','8889'],cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
  with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1280,'height':720},device_scale_factor=1)
    page.on('console', lambda m: print('console',m.type,m.text[:160]) if m.type=='error' else None)
    page.on('pageerror',lambda e: print('pageerror',str(e)[:200]))
    page.goto((root/'play.html').as_uri() + '?test=1',wait_until='load',timeout=60000)
    page.wait_for_function('window.__V2N__ && !document.querySelector("#app").classList.contains("booting")',timeout=40000)
    page.wait_for_timeout(3500)
    print('asset',page.evaluate("() => ({map: !!window.__V2N_FANTASY_MAP__, ready:!!window.__V2N__})"))
    print('creator',page.locator('#creator').is_visible())
    Path(root/'qa/screens').mkdir(parents=True,exist_ok=True)
    page.screenshot(path=str(root/'qa/screens/creator-fantasy.png'))
    if page.locator('#creator').is_visible():
      page.locator('#cr-name').fill('River')
      page.locator('#cr-hair [data-v=short]').click()
      page.locator('#cr-beard [data-v="1"]').click()
      page.locator('#cr-hat [data-v="2"]').click()
      page.locator('#cr-outfit [data-v=blue]').click()
      page.wait_for_timeout(1000)
      page.screenshot(path=str(root/'qa/screens/creator-layered.png'))
      page.locator('#cr-confirm').click()
    page.wait_for_timeout(1400)
    page.screenshot(path=str(root/'qa/screens/world-fantasy.png'))
    browser.close()
finally:
 server.terminate()
