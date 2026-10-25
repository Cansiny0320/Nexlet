import pathlib, re, shutil, subprocess, time
source=pathlib.Path('/etc/nginx/sites-enabled/oracle-subscription').resolve()
text=source.read_text()
include='include /etc/nginx/snippets/nexlet.conf;'
if include not in text:
    match=re.search(r'listen\s+8443\b',text)
    if not match: raise RuntimeError('Expected HTTPS listener not found')
    start=text.rfind('server',0,match.start())
    opening=text.index('{',start)
    depth=1
    end=opening+1
    while depth and end<len(text):
        if text[end]=='{': depth+=1
        if text[end]=='}': depth-=1
        end+=1
    if depth: raise RuntimeError('Cannot locate server block')
    backup=pathlib.Path('/var/backups/nexlet-route-'+time.strftime('%Y%m%d-%H%M%S'))
    backup.mkdir(mode=0o700)
    shutil.copy2(source,backup/source.name)
    source.write_text(text[:end-1]+'    '+include+'\n'+text[end-1:])
    try: subprocess.run(['nginx','-t'],check=True)
    except Exception:
        source.write_text(text)
        raise
else: subprocess.run(['nginx','-t'],check=True)
subprocess.run(['systemctl','reload','nginx'],check=True)
print('Nexlet HTTPS route activated; existing listeners retained')
