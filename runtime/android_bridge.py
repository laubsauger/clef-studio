"""Keep one native accessibility connection alive; JSON lines stay on local stdio."""
import json
import sys
import time
import uiautomator2 as u2

devices = {}
for line in sys.stdin:
    request = json.loads(line)
    started = time.perf_counter()
    try:
        serial = request['serial']
        if serial not in devices:
            device = u2.connect(serial)
            device.jsonrpc.setConfigurator({'waitForIdleTimeout': 0, 'waitForSelectorTimeout': 0})
            devices[serial] = device
        # Use the native RPC directly: an empty hierarchy is an error in our parser.
        xml = devices[serial].jsonrpc.dumpWindowHierarchy(False, 80, True, http_timeout=5)
        response = {'id': request['id'], 'xml': xml, 'capture_ms': round((time.perf_counter() - started) * 1000)}
    except Exception as error:
        response = {'id': request['id'], 'error': str(error)}
    print(json.dumps(response), flush=True)
