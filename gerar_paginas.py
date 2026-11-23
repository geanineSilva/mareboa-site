"""
Gera as páginas abertas dos pontos de pesca do site mareboa.app.br.

Entrada: dados/pontos-publicos.json (só os campos que podem ser públicos).
Saída:   pontos/<pagina>/index.html, pontos/index.html, sitemap.xml, robots.txt

Como usar (na pasta do site):
    python gerar_paginas.py

Para adicionar ou tirar um ponto, edite dados/pontos-publicos.json e rode de novo.
"""
import html
import json
from datetime import date
from pathlib import Path

SITE = "https://mareboa.app.br"
RAIZ = Path(__file__).resolve().parent
MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
         "agosto", "setembro", "outubro", "novembro", "dezembro"]
TIPO_TEXTO = {"praia": "Praia", "costao": "Praia e costão", "rio": "Rio", "lagoa_canal": "Água abrigada"}

e = html.escape


def topo(titulo, descricao, url, extra_head=""):
    return f"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(titulo)}</title>
<meta name="description" content="{e(descricao)}">
<link rel="canonical" href="{url}">
<meta name="theme-color" content="#061827">
<meta property="og:type" content="website">
<meta property="og:title" content="{e(titulo)}">
<meta property="og:description" content="{e(descricao)}">
<meta property="og:image" content="{SITE}/img/destaque.jpg">
<meta property="og:url" content="{url}">
<link rel="icon" href="/favicon.png" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Roboto:wght@400;500;700&display=swap">
<link rel="stylesheet" href="/pontos/pontos.css">
{extra_head}</head>
<body>
<header class="bar"><div class="wrap">
  <a class="logo" href="/" aria-label="Maré Boa">MAR<svg class="e-onda" viewBox="0 0 18 22" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" aria-hidden="true"><path d="M8.5 -2.5 12 -6"/><path d="M1.5 3c2.6-2.2 5-.1 7.5 0s4.9-2.2 7.5 0M1.5 11c2.6-2.2 5-.1 7.5 0s4.9-2.2 7.5 0M1.5 19c2.6-2.2 5-.1 7.5 0s4.9-2.2 7.5 0"/></svg><span class="logo-boa">BOA</span></a>
  <nav class="menu"><a href="/">Início</a><a href="/pontos/">Pontos de pesca</a><a class="btn btn-accent" href="/#testar">Quero testar</a></nav>
</div></header>
"""


RODAPE = """<footer><div class="wrap">
  <div><strong>MARÉ BOA</strong><p>App de pesca da Grande Florianópolis. Feito em Floripa, por quem pesca, para quem pesca.</p></div>
  <div><a href="/pontos/">Pontos de pesca</a><a href="/#testar">Quero testar o app</a></div>
  <div><a href="/privacidade/">Privacidade</a><a href="mailto:mareboa.app@gmail.com">mareboa.app@gmail.com</a></div>
</div></footer>
</body>
</html>
"""


def chamada_app(nome):
    return f"""<section class="card cta o2">
    <h2>Planeje sua próxima pesca</h2>
    <ul>
      <li>Melhor janela de hoje e de amanhã, hora a hora</li>
      <li>Equipamento e isca indicados pra {e(nome)}</li>
      <li>Água limpa ou suja confirmada por quem está lá</li>
      <li>Seus pontos favoritos e sua Sala de Troféus</li>
    </ul>
    <a class="btn btn-accent" href="/#testar">Quero testar o app</a>
    <small>Gratuito, sem anúncios, para Android.</small>
  </section>"""


def pagina_ponto(p, todos, hoje):
    url = f"{SITE}/pontos/{p['pagina']}/"
    peixes_mes = [x.strip() for x in p["peixes"][str(hoje.month)].split(";") if x.strip()]
    titulo = f"{p['nome']} ({p['cidade']}): previsão de pesca, maré e vento hoje | Maré Boa"
    descricao = (f"Como está pra pescar em {p['nome']}, {p['cidade']}: nota do dia, vento, chuva, maré "
                 f"e o que costuma sair em {MESES[hoje.month - 1]}. Atualizado a cada visita.")
    dados_lugar = {
        "@context": "https://schema.org", "@type": "Place", "name": p["nome"],
        "address": {"@type": "PostalAddress", "addressLocality": p["cidade"], "addressRegion": "SC", "addressCountry": "BR"},
        "geo": {"@type": "GeoCoordinates", "latitude": p["lat"], "longitude": p["lon"]},
        "url": url,
    }
    extra = f'<script type="application/ld+json">{json.dumps(dados_lugar, ensure_ascii=False)}</script>\n'
    outros = [o for o in todos if o["pagina"] != p["pagina"]]
    # primeiro os da mesma cidade
    outros.sort(key=lambda o: (o["cidade"] != p["cidade"], o["nome"]))
    lista_outros = "\n".join(
        f'      <li><a href="/pontos/{o["pagina"]}/">{e(o["nome"])} <span>{e(o["cidade"])}</span></a></li>'
        for o in outros[:6])
    chips = "".join(f'<span class="chip">{e(x)}</span>' for x in peixes_mes)

    return topo(titulo, descricao, url, extra) + f"""<section class="hero"><div class="wrap">
  <nav class="crumbs"><a href="/">Início</a> / <a href="/pontos/">Pontos de pesca</a> / {e(p['nome'])}</nav>
  <div class="where">{e(p['cidade'])} · {e(p['regiao'])}</div>
  <h1>{e(p['nome'])}</h1>
  <p>{e(p['resumo'])}</p>
  <div class="pills"><span class="pill">{e(TIPO_TEXTO.get(p['tipo'], 'Ponto de pesca'))}</span><span class="pill">{e(p['ambiente'])}</span></div>
</div></section>

<div class="wrap page">
  <main class="main">
    <section class="card o1">
      <h2>Como está pra pescar agora</h2>
      <div id="condicao"><p class="loading">Carregando a previsão de {e(p['nome'])}...</p></div>
    </section>

    <section class="card o3">
      <h2>Peixes do mês</h2>
      <div id="peixes"><p>O que costuma sair em {MESES[hoje.month - 1]}:</p>{chips}</div>
    </section>

    <section class="card o4">
      <h2>Sobre o ponto</h2>
      <dl class="facts">
        <div><dt>Cidade</dt><dd>{e(p['cidade'])} - SC</dd></div>
        <div><dt>Região</dt><dd>{e(p['regiao'])}</dd></div>
        <div><dt>Ambiente</dt><dd>{e(p['ambiente'])}</dd></div>
      </dl>
      <a class="btn btn-line" href="{e(p['mapa'])}" target="_blank" rel="noopener">Abrir no Google Maps</a>
    </section>
  </main>

  <aside class="side">
    {chamada_app(p['nome'])}
    <section class="card o5">
      <h2>Outros pontos</h2>
      <ul class="others">
{lista_outros}
      </ul>
      <p><a href="/pontos/">Ver todos os pontos</a></p>
    </section>
  </aside>
</div>
<script src="/pontos/condicoes.js"></script>
<script>
  MareBoa.mostrar(document.getElementById("condicao"), {p['lat']}, {p['lon']}, {json.dumps(p['tipo'])});
  MareBoa.peixesDoMes(document.getElementById("peixes"), {json.dumps(p['peixes'], ensure_ascii=False)});
</script>
""" + RODAPE


def pagina_lista(todos):
    url = f"{SITE}/pontos/"
    titulo = "Pontos de pesca na Grande Florianópolis: previsão, maré e vento | Maré Boa"
    descricao = ("Pontos de pesca em Florianópolis, Palhoça e região, com a condição de agora: "
                 "vento, chuva, maré e o que costuma sair em cada lugar.")
    por_cidade = {}
    for p in sorted(todos, key=lambda x: (x["cidade"], x["nome"])):
        por_cidade.setdefault(p["cidade"], []).append(p)
    blocos = []
    for cidade, pontos in por_cidade.items():
        cards = "\n".join(
            f'      <a class="pcard" href="/pontos/{p["pagina"]}/"><strong>{e(p["nome"])}</strong>'
            f'<span>{e(p["ambiente"])}</span><em>Ver condição de agora</em></a>'
            for p in pontos)
        blocos.append(f"""  <section class="cidade">
    <h2>{e(cidade)}</h2>
    <div class="cards">
{cards}
    </div>
  </section>""")
    return topo(titulo, descricao, url) + f"""<section class="hero"><div class="wrap">
  <nav class="crumbs"><a href="/">Início</a> / Pontos de pesca</nav>
  <div class="where">Grande Florianópolis</div>
  <h1>Pontos de pesca</h1>
  <p>Escolha o ponto e veja como está pra pescar agora: vento, chuva, maré e o que costuma sair.</p>
</div></section>
<main class="wrap" style="padding-top:36px;padding-bottom:20px">
{chr(10).join(blocos)}
</main>
<section class="band"><div class="wrap">
  <div><h2>Planeje sua próxima pesca</h2><p>Melhor janela hora a hora, equipamento indicado e seus pontos favoritos no app.</p></div>
  <a class="btn btn-accent" href="/#testar">Quero testar o app</a>
</div></section>
""" + RODAPE


def main():
    todos = json.loads((RAIZ / "dados" / "pontos-publicos.json").read_text(encoding="utf-8"))
    hoje = date.today()
    pasta = RAIZ / "pontos"
    for p in todos:
        destino = pasta / p["pagina"]
        destino.mkdir(parents=True, exist_ok=True)
        (destino / "index.html").write_text(pagina_ponto(p, todos, hoje), encoding="utf-8")
    (pasta / "index.html").write_text(pagina_lista(todos), encoding="utf-8")

    # cartões dos pontos na página inicial, entre os marcadores
    home = RAIZ / "index.html"
    h = home.read_text(encoding="utf-8")
    ini, fim = "<!-- pontos:inicio -->", "<!-- pontos:fim -->"
    if ini in h and fim in h:
        cards = "\n".join(
            f'    <a class="pcard" href="/pontos/{p["pagina"]}/"><strong>{e(p["nome"])}</strong>'
            f'<span>{e(p["cidade"])} · {e(TIPO_TEXTO.get(p["tipo"], ""))}</span><em>Ver condição de agora</em></a>'
            for p in sorted(todos, key=lambda x: x["nome"]))
        antes, resto = h.split(ini, 1)
        depois = resto.split(fim, 1)[1]
        home.write_text(antes + ini + "\n" + cards + "\n" + fim + depois, encoding="utf-8")

    urls = [f"{SITE}/", f"{SITE}/pontos/"] + [f"{SITE}/pontos/{p['pagina']}/" for p in todos]
    sitemap = ['<?xml version="1.0" encoding="UTF-8"?>',
               '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    sitemap += [f"  <url><loc>{u}</loc><lastmod>{hoje.isoformat()}</lastmod></url>" for u in urls]
    sitemap.append("</urlset>")
    (RAIZ / "sitemap.xml").write_text("\n".join(sitemap) + "\n", encoding="utf-8")
    (RAIZ / "robots.txt").write_text(
        "User-agent: *\nAllow: /\nDisallow: /redefinir-senha/\n\nSitemap: " + SITE + "/sitemap.xml\n",
        encoding="utf-8")
    print(f"{len(todos)} páginas de pontos geradas, mais a lista, o sitemap e o robots.txt.")


if __name__ == "__main__":
    main()
