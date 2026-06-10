import ssl
import http.server
import socketserver
import os
import sys
import logging

PORT = 8443
BASE = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(BASE, 'server.log')

os.chdir(BASE)

# Log to both console and file
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE, encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)
log = logging.getLogger()

class LogHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        msg = f"{self.client_address[0]} {format % args}"
        log.info(msg)

    def log_error(self, format, *args):
        msg = f"ERROR {self.client_address[0]} {format % args}"
        log.error(msg)

ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(os.path.join(BASE, 'cert.pem'), os.path.join(BASE, 'key.pem'))

log.info(f"Starting HTTPS server on port {PORT}")
log.info(f"Phone URL: https://192.168.0.109:{PORT}/ControlTask/")
log.info(f"Log file: {LOG_FILE}")

with socketserver.TCPServer(("", PORT), LogHandler) as httpd:
    httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
    httpd.serve_forever()
