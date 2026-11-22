import sys, zipfile
from lxml import etree
sys.stdout.reconfigure(encoding="utf-8")
W="{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
z=zipfile.ZipFile(sys.argv[1])
root=etree.fromstring(z.read("word/document.xml"))

def celltext(tc):
    # join paragraphs with " / " so separate lines stay distinguishable
    paras=[]
    for p in tc.findall(W+"p"):
        t="".join(x.text or "" for x in p.iter(W+"t")).strip()
        if t: paras.append(t)
    return " / ".join(paras)

def dump(tbl, depth, label):
    rows=tbl.findall(W+"tr"); ind="  "*depth
    print(f"{ind}>>> TABLE {label} rows={len(rows)}")
    for ri,tr in enumerate(rows):
        tcs=tr.findall(W+"tc")
        print(f"{ind}R{ri}: " + " || ".join(celltext(tc) for tc in tcs))
        for ci,tc in enumerate(tcs):
            for ni,ntbl in enumerate(tc.findall(W+"tbl")):
                dump(ntbl, depth+1, f"{label}>{ri}.{ci}.{ni}")
    print(f"{ind}<<< END {label}")

for n,tbl in enumerate(root.find(W+"body").findall(W+"tbl"),1):
    dump(tbl,0,str(n))
