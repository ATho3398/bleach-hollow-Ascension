import http.server, sys, os
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'max-age=600')
        super().end_headers()
    def log_message(self, *a): pass
os.chdir(sys.argv[2]); http.server.ThreadingHTTPServer(('', int(sys.argv[1])), H).serve_forever()
