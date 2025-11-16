// =========================
// Firebase / Firestore
// =========================

const db = firebase.firestore();

// jsPDF (via CDN)
const { jsPDF } = window.jspdf || {};

// =========================
// Utilidades de data e dinheiro
// =========================

function hojeISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function formatarDataBonita(iso) {
  if (!iso) return "";
  const [ano, mes, dia] = iso.split("-");
  const meses = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  return `${dia}/${meses[parseInt(mes, 10)-1]}/${ano}`;
}

function formatarValorReal(valor) {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function aplicarMascaraMoeda(input) {
  let digits = input.value.replace(/\D/g, "");
  if (!digits) {
    input.value = "0,00";
    return;
  }
  const numero = parseInt(digits, 10) / 100;
  input.value = numero.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function parseMoedaBR(str) {
  if (!str) return 0;
  const limpo = str.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(limpo);
  return isNaN(n) ? 0 : n;
}

// =========================
// Estado em memória
// =========================

let transacoes = [];
let contas = [];

let modoEdicaoContas = false;
let contaPendenteExclusaoId = null;
let contaEmEdicaoId = null;

let modoExclusaoMovimentos = false;

// =========================
// Elementos da UI
// =========================

const spanDataHoje = document.getElementById("data-hoje");
const spanMovimentoHoje = document.getElementById("movimento-hoje");
const spanMovimentoMes = document.getElementById("movimento-mes");

const formLancamento = document.getElementById("form-lancamento");
const inputTipo = document.getElementById("tipo");
const inputValor = document.getElementById("valor");
const inputDescricao = document.getElementById("descricao");
const inputDataLancamento = document.getElementById("data-lancamento");

const campoContaPredefinida = document.getElementById("campo-conta-predefinida");
const campoParcelaConta = document.getElementById("campo-parcela-conta");
const selectContaPredefinida = document.getElementById("conta-predefinida-select");
const selectParcelaConta = document.getElementById("parcela-conta-select");

const campoDescricao = document.getElementById("campo-descricao");
const campoEstabelecimento = document.getElementById("campo-estabelecimento");
const inputEstabelecimento = document.getElementById("estabelecimento");

const inputDataConsulta = document.getElementById("data-consulta");
const listaDiaria = document.getElementById("lista-diaria");
const btnMovDelMode = document.getElementById("btn-mov-del-mode");

const btnContaAdd = document.getElementById("btn-conta-add");
const btnContaEditMode = document.getElementById("btn-conta-edit-mode");
const inputFiltroMesAno = document.getElementById("filtro-mes-ano");
const listaContas = document.getElementById("lista-contas");

const modalConta = document.getElementById("modal-conta");
const modalContaTitulo = document.getElementById("modal-conta-titulo");
const btnModalContaFechar = document.getElementById("modal-conta-fechar");
const formConta = document.getElementById("form-conta");
const inputContaDescricao = document.getElementById("conta-descricao");
const inputContaValorTotal = document.getElementById("conta-valor-total");
const inputContaQtdParcelas = document.getElementById("conta-qtd-parcelas");
const inputContaValorParcela = document.getElementById("conta-valor-parcela");
const inputContaPrimeiraData = document.getElementById("conta-primeira-data");
const btnSalvarConta = document.getElementById("btn-salvar-conta");

const modalConfirmaExclusao = document.getElementById("modal-confirma-excluir");
const btnCancelarExclusao = document.getElementById("btn-cancelar-exclusao");
const btnConfirmarExclusao = document.getElementById("btn-confirmar-exclusao");

// Relatório
const btnRelatorio = document.getElementById("btn-relatorio");
const modalRelatorio = document.getElementById("modal-relatorio");
const btnModalRelatorioFechar = document.getElementById("modal-relatorio-fechar");
const inputRelAno = document.getElementById("rel-ano");
const selectRelMes = document.getElementById("rel-mes");
const btnGerarRelatorio = document.getElementById("btn-gerar-relatorio");

// =========================
// Inicialização
// =========================

function inicializarDatas() {
  const hoje = hojeISO();
  spanDataHoje.textContent = formatarDataBonita(hoje);
  inputDataLancamento.value = hoje;
  inputDataConsulta.value = hoje;

  const [ano, mes] = hoje.split("-").slice(0, 2);
  inputFiltroMesAno.value = `${ano}-${mes}`;
  inputContaPrimeiraData.value = hoje;
}

function atualizarVisibilidadeContaPredefinida() {
  const tipo = inputTipo.value;
  const isConta = tipo === "conta";
  const isSaida = tipo === "saida";

  // campos específicos de conta
  campoContaPredefinida.style.display = isConta ? "flex" : "none";
  campoParcelaConta.style.display = isConta ? "flex" : "none";

  // descrição só pra entrada / saída
  if (campoDescricao) {
    if (!tipo || tipo === "conta") {
      campoDescricao.style.display = "none";
    } else {
      campoDescricao.style.display = "flex";
    }
  }

  // estabelecimento só em saída
  if (campoEstabelecimento) {
    campoEstabelecimento.style.display = isSaida ? "flex" : "none";
    if (!isSaida) {
      inputEstabelecimento.value = "";
    }
  }

  // valor digitável só para entrada / saída
  inputValor.readOnly = isConta;

  if (!isConta) {
    if (!tipo) {
      inputValor.value = "0,00";
    }
    selectContaPredefinida.value = "";
    selectParcelaConta.innerHTML = `<option value="">— selecione —</option>`;
  } else {
    atualizarValorPorParcelaSelecionada();
  }
}

// =========================
// Movimento do dia e mês
// =========================

function atualizarMovimentoHoje() {
  const hoje = hojeISO();

  const mov = transacoes
    .filter(t => t.dataISO === hoje)
    .reduce((acc, t) => {
      if (t.tipo === "entrada") return acc + t.valor;
      return acc - t.valor;
    }, 0);

  spanMovimentoHoje.textContent = formatarValorReal(mov);
  spanMovimentoHoje.classList.remove("saldo-positivo", "saldo-negativo", "saldo-zero");

  if (mov > 0) {
    spanMovimentoHoje.classList.add("saldo-positivo");
  } else if (mov < 0) {
    spanMovimentoHoje.classList.add("saldo-negativo");
  } else {
    spanMovimentoHoje.classList.add("saldo-zero");
  }

  atualizarMovimentoMes();
}

function atualizarMovimentoMes() {
  if (!spanMovimentoMes) return;

  const hoje = hojeISO();
  const [anoRef, mesRef] = hoje.split("-").map(n => parseInt(n, 10));

  const movMes = transacoes.reduce((acc, t) => {
    if (!t.dataISO) return acc;
    const [ano, mes] = t.dataISO.split("-").map(n => parseInt(n, 10));
    if (ano !== anoRef || mes !== mesRef) return acc;

    if (t.tipo === "entrada") return acc + t.valor;
    return acc - t.valor;
  }, 0);

  spanMovimentoMes.textContent = formatarValorReal(movMes);
}

// =========================
// Lançamentos
// =========================

inputValor.addEventListener("input", () => {
  if (inputTipo.value === "conta") return;
  aplicarMascaraMoeda(inputValor);
});

inputContaValorTotal.addEventListener("input", () => {
  aplicarMascaraMoeda(inputContaValorTotal);
  atualizarValorParcelaConta();
});

inputContaQtdParcelas.addEventListener("input", () => {
  atualizarValorParcelaConta();
});

function atualizarValorParcelaConta() {
  const total = parseMoedaBR(inputContaValorTotal.value);
  const qtd = parseInt(inputContaQtdParcelas.value || "1", 10);
  if (!qtd || qtd <= 0) {
    inputContaValorParcela.value = "";
    return;
  }
  const parcela = total / qtd;
  inputContaValorParcela.value = parcela.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

inputTipo.addEventListener("change", atualizarVisibilidadeContaPredefinida);

formLancamento.addEventListener("submit", async (e) => {
  e.preventDefault();

  const tipo = inputTipo.value;
  if (!tipo) {
    alert("Selecione o tipo de lançamento.");
    return;
  }

  const valor = parseMoedaBR(inputValor.value);
  if (!valor || valor <= 0) return;

  const dataISO = inputDataLancamento.value || hojeISO();

  let contaId = null;
  let parcelaIndex = null;
  let descricao;
  let estabelecimento = null;

  if (tipo === "conta") {
    contaId = selectContaPredefinida.value || null;
    parcelaIndex = selectParcelaConta.value
      ? parseInt(selectParcelaConta.value, 10)
      : null;

    if (!contaId || parcelaIndex === null) {
      alert("Selecione a conta e a parcela.");
      return;
    }

    const conta = contas.find(c => c.id === contaId);
    descricao = conta ? conta.descricao : "Conta predefinida";
  } else {
    descricao = inputDescricao.value.trim() || "(sem descrição)";
    if (tipo === "saida") {
      estabelecimento = inputEstabelecimento.value.trim() || null;
    }
  }

  const transacao = {
    tipo,
    valor,
    descricao,
    estabelecimento,
    dataISO,
    contaId,
    parcelaIndex,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    await db.collection("transacoes").add(transacao);
  } catch (err) {
    console.error("Erro ao salvar transação:", err);
    alert("Não foi possível salvar o lançamento.");
    return;
  }

  inputValor.value = "0,00";
  inputDescricao.value = "";
  inputEstabelecimento.value = "";
});

// =========================
// Consulta diária
// =========================

inputDataConsulta.addEventListener("change", () => {
  renderizarListaDiaria();
});

btnMovDelMode.addEventListener("click", () => {
  modoExclusaoMovimentos = !modoExclusaoMovimentos;
  renderizarListaDiaria();
});

function renderizarListaDiaria() {
  const data = inputDataConsulta.value || hojeISO();
  listaDiaria.innerHTML = "";

  const doDia = transacoes.filter(t => t.dataISO === data);

  if (!doDia.length) {
    const li = document.createElement("li");
    li.textContent = "Nenhuma movimentação neste dia.";
    li.style.fontSize = "0.8rem";
    li.style.color = "#85888d";
    listaDiaria.appendChild(li);
    return;
  }

  doDia.forEach(t => {
    const li = document.createElement("li");
    li.className = "item-movimento";

    const divInfo = document.createElement("div");
    divInfo.className = "mov-info";

    let titulo;
    if (t.tipo === "saida" && t.estabelecimento) {
      titulo = `${t.estabelecimento} / ${t.descricao}`;
    } else {
      titulo = t.descricao;
    }

    divInfo.innerHTML = `
      <span>${titulo}</span>
      <span>${
        t.tipo === "entrada"
          ? "Entrada"
          : (t.tipo === "saida" ? "Saída" : "Conta predefinida")
      }</span>
    `;

    const spanValor = document.createElement("span");
    spanValor.className = "mov-valor " + t.tipo;
    const sinal = t.tipo === "entrada" ? "+" : "-";
    spanValor.textContent = sinal + formatarValorReal(t.valor);

    li.appendChild(divInfo);
    li.appendChild(spanValor);

    if (modoExclusaoMovimentos) {
      const btnDel = document.createElement("button");
      btnDel.className = "btn-icon";
      btnDel.textContent = "−";
      btnDel.addEventListener("click", async () => {
        const ok = confirm("Excluir este lançamento?");
        if (!ok) return;
        try {
          await db.collection("transacoes").doc(t.id).delete();
        } catch (err) {
          console.error("Erro ao excluir lançamento:", err);
          alert("Não foi possível excluir este lançamento.");
        }
      });
      li.appendChild(btnDel);
    }

    listaDiaria.appendChild(li);
  });
}

// =========================
// Contas e parcelas
// =========================

btnContaAdd.addEventListener("click", () => {
  abrirModalConta(null);
});

btnContaEditMode.addEventListener("click", () => {
  modoEdicaoContas = !modoEdicaoContas;
  renderizarContas();
});

btnModalContaFechar.addEventListener("click", () => {
  fecharModalConta();
});

formConta.addEventListener("submit", async (e) => {
  e.preventDefault();

  const descricao = inputContaDescricao.value.trim();
  if (!descricao) return;

  if (contas.some(c => c.descricao.toLowerCase() === descricao.toLowerCase() && c.id !== contaEmEdicaoId)) {
    alert("Já existe uma conta com esta descrição.");
    return;
  }

  const valorTotal = parseMoedaBR(inputContaValorTotal.value);
  const qtdParcelas = parseInt(inputContaQtdParcelas.value || "1", 10);
  const primeiraDataISO = inputContaPrimeiraData.value || hojeISO();

  if (!valorTotal || valorTotal <= 0 || !qtdParcelas || qtdParcelas <= 0) return;

  const contaData = {
    descricao,
    valorTotal,
    qtdParcelas,
    primeiraDataISO
  };

  try {
    if (contaEmEdicaoId) {
      await db.collection("contas").doc(contaEmEdicaoId).update(contaData);
    } else {
      await db.collection("contas").add({
        ...contaData,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
  } catch (err) {
    console.error("Erro ao salvar conta:", err);
    alert("Não foi possível salvar a conta.");
    return;
  }

  fecharModalConta();
  limparFormularioConta();
});

btnCancelarExclusao.addEventListener("click", () => {
  contaPendenteExclusaoId = null;
  fecharModalExclusao();
});

btnConfirmarExclusao.addEventListener("click", async () => {
  if (contaPendenteExclusaoId) {
    try {
      await db.collection("contas").doc(contaPendenteExclusaoId).delete();
    } catch (err) {
      console.error("Erro ao excluir conta:", err);
      alert("Não foi possível excluir esta conta.");
    }
    contaPendenteExclusaoId = null;
  }
  fecharModalExclusao();
});

inputFiltroMesAno.addEventListener("change", () => {
  renderizarContas();
});

function abrirModalConta(conta) {
  if (conta) {
    contaEmEdicaoId = conta.id;
    modalContaTitulo.textContent = "Editar conta";
    btnSalvarConta.textContent = "Salvar alterações";

    inputContaDescricao.value = conta.descricao;
    inputContaValorTotal.value = conta.valorTotal.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    inputContaQtdParcelas.value = conta.qtdParcelas;
    inputContaPrimeiraData.value = conta.primeiraDataISO;
    atualizarValorParcelaConta();
  } else {
    contaEmEdicaoId = null;
    modalContaTitulo.textContent = "Nova conta mensal";
    btnSalvarConta.textContent = "Salvar conta";
    limparFormularioConta();
  }
  modalConta.classList.add("visivel");
}

function fecharModalConta() {
  modalConta.classList.remove("visivel");
}

function limparFormularioConta() {
  inputContaDescricao.value = "";
  inputContaValorTotal.value = "0,00";
  inputContaQtdParcelas.value = "1";
  atualizarValorParcelaConta();
}

function abrirModalExclusao(contaId) {
  contaPendenteExclusaoId = contaId;
  modalConfirmaExclusao.classList.add("visivel");
}

function fecharModalExclusao() {
  modalConfirmaExclusao.classList.remove("visivel");
}

// =========================
// Select de contas e parcelas
// =========================

function preencherSelectContas() {
  selectContaPredefinida.innerHTML = `<option value="">— selecione —</option>`;
  contas.forEach(conta => {
    const opt = document.createElement("option");
    opt.value = conta.id;
    opt.textContent = conta.descricao;
    selectContaPredefinida.appendChild(opt);
  });
  preencherSelectParcelas();
  atualizarValorPorParcelaSelecionada();
}

selectContaPredefinida.addEventListener("change", () => {
  preencherSelectParcelas();
  atualizarValorPorParcelaSelecionada();
});

selectParcelaConta.addEventListener("change", () => {
  atualizarValorPorParcelaSelecionada();
});

function preencherSelectParcelas() {
  selectParcelaConta.innerHTML = `<option value="">— selecione —</option>`;

  const contaId = selectContaPredefinida.value;
  if (!contaId) return;

  const conta = contas.find(c => c.id === contaId);
  if (!conta) return;

  for (let i = 1; i <= conta.qtdParcelas; i++) {
    const opt = document.createElement("option");
    opt.value = i - 1;
    opt.textContent = `${i}ª parcela`;
    selectParcelaConta.appendChild(opt);
  }
}

function atualizarValorPorParcelaSelecionada() {
  if (inputTipo.value !== "conta") return;

  const contaId = selectContaPredefinida.value;
  const idxStr = selectParcelaConta.value;
  if (!contaId || idxStr === "") {
    inputValor.value = "0,00";
    return;
  }

  const conta = contas.find(c => c.id === contaId);
  if (!conta) return;

  const valorParcela = conta.valorTotal / conta.qtdParcelas;
  inputValor.value = valorParcela.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// =========================
// Parcelas por conta
// =========================

function obterParcelasDaConta(conta) {
  const parcelas = [];
  const valorParcela = conta.valorTotal / conta.qtdParcelas;
  const primeira = new Date(conta.primeiraDataISO);

  for (let i = 0; i < conta.qtdParcelas; i++) {
    const data = new Date(primeira);
    data.setMonth(primeira.getMonth() + i);
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, "0");
    const dia = String(data.getDate()).padStart(2, "0");
    const dataISO = `${ano}-${mes}-${dia}`;

    parcelas.push({
      index: i,
      numero: i + 1,
      totalParcelas: conta.qtdParcelas,
      valor: valorParcela,
      dataISO
    });
  }

  return parcelas;
}

function renderizarContas() {
  listaContas.innerHTML = "";
  const mesAno = inputFiltroMesAno.value;
  if (!mesAno) return;

  const [anoFiltro, mesFiltro] = mesAno.split("-").map(v => parseInt(v, 10));
  const hoje = hojeISO();

  contas.forEach(conta => {
    const parcelas = obterParcelasDaConta(conta);

    parcelas.forEach(parcela => {
      const data = new Date(parcela.dataISO);
      const ano = data.getFullYear();
      const mes = data.getMonth() + 1;

      if (ano !== anoFiltro || mes !== mesFiltro) return;

      const li = document.createElement("li");
      li.className = "item-conta";

      const divMain = document.createElement("div");
      divMain.className = "item-conta-main";

      const linhaTop = document.createElement("div");
      linhaTop.className = "item-conta-top";
      const spanParcela = document.createElement("span");
      spanParcela.className = "parcela-label";
      spanParcela.textContent = `${parcela.numero}/${parcela.totalParcelas}`;

      const spanDescricao = document.createElement("span");
      spanDescricao.textContent = conta.descricao;
      linhaTop.appendChild(spanParcela);
      linhaTop.appendChild(spanDescricao);

      const linhaBottom = document.createElement("div");
      linhaBottom.className = "item-conta-bottom";
      const spanValor = document.createElement("span");
      spanValor.className = "valor-parcela";
      spanValor.textContent = formatarValorReal(parcela.valor);
      const spanData = document.createElement("span");
      spanData.className = "data-parcela";
      spanData.textContent = formatarDataBonita(parcela.dataISO);
      linhaBottom.appendChild(spanValor);
      linhaBottom.appendChild(spanData);

      divMain.appendChild(linhaTop);
      divMain.appendChild(linhaBottom);

      const caixinha = document.createElement("div");
      caixinha.className = "status-caixinha";

      const paga = transacoes.some(t =>
        t.tipo === "conta" &&
        t.contaId === conta.id &&
        t.parcelaIndex === parcela.index
      );

      if (paga) {
        caixinha.classList.add("paga");
      } else if (parcela.dataISO < hoje) {
        caixinha.classList.add("atrasada");
      }

      li.appendChild(divMain);
      li.appendChild(caixinha);

      if (modoEdicaoContas) {
        li.addEventListener("click", (ev) => {
          if (ev.target.classList.contains("btn-icon")) return;
          abrirModalConta(conta);
        });

        const btnDel = document.createElement("button");
        btnDel.className = "btn-icon";
        btnDel.textContent = "−";
        btnDel.addEventListener("click", (ev) => {
          ev.stopPropagation();
          abrirModalExclusao(conta.id);
        });
        li.appendChild(btnDel);
      }

      listaContas.appendChild(li);
    });
  });
}

// =========================
// Relatório em PDF
// =========================

function abrirModalRelatorio() {
  const hoje = hojeISO();
  const anoAtual = parseInt(hoje.split("-")[0], 10);
  inputRelAno.value = anoAtual;
  selectRelMes.value = "";
  modalRelatorio.classList.add("visivel");
}

function fecharModalRelatorio() {
  modalRelatorio.classList.remove("visivel");
}

async function gerarRelatorio() {
  if (!jsPDF) {
    alert("Biblioteca de PDF não carregada.");
    return;
  }
  if (!transacoes.length) {
    alert("Não há movimentações para gerar relatório.");
    return;
  }

  const ano = parseInt(inputRelAno.value, 10);
  if (!ano) {
    alert("Informe um ano válido.");
    return;
  }

  const mesSel = selectRelMes.value ? parseInt(selectRelMes.value, 10) : null;

  const filtradas = transacoes.filter(t => {
    if (!t.dataISO) return false;
    const [a, m] = t.dataISO.split("-").map(Number);
    if (a !== ano) return false;
    if (mesSel && m !== mesSel) return false;
    return true;
  });

  if (!filtradas.length) {
    alert("Não há movimentações nesse período.");
    return;
  }

  const porData = {};
  filtradas.forEach(t => {
    if (!porData[t.dataISO]) porData[t.dataISO] = [];
    porData[t.dataISO].push(t);
  });

  const datasOrdenadas = Object.keys(porData).sort();

  const mesesNomes = [
    "janeiro","fevereiro","março","abril","maio","junho",
    "julho","agosto","setembro","outubro","novembro","dezembro"
  ];

  const doc = new jsPDF();

  const tituloPeriodo = mesSel
    ? `${mesesNomes[mesSel-1]} / ${ano}`
    : `${ano}`;

  // Cores
  const corTitulo = [60, 60, 60];
  const corSub = [120, 120, 120];
  const corLinha = [220, 220, 220];
  const corTexto = [40, 40, 40];
  const corPositivo = [0, 140, 0];
  const corNegativo = [200, 0, 0];

  // Cabeçalho
  doc.setFontSize(16);
  doc.setTextColor(...corTitulo);
  doc.text("Relatório de Finanças dos Muzis", 105, 15, { align: "center" });

  doc.setFontSize(12);
  doc.setTextColor(...corSub);
  doc.text(tituloPeriodo, 105, 22, { align: "center" });

  doc.setFontSize(9);
  const dataGeracao = formatarDataBonita(hojeISO());
  doc.text(`Gerado em ${dataGeracao}`, 105, 28, { align: "center" });

  // Linha horizontal
  doc.setDrawColor(...corLinha);
  doc.line(10, 32, 200, 32);

  let y = 38;
  let totalGeral = 0;

  function quebraLinha(inc) {
    y += inc;
    if (y > 280) {
      doc.addPage();
      y = 20;
    }
  }

  datasOrdenadas.forEach(dataISO => {
    const lista = porData[dataISO];
    let totalDia = 0;

    // Data
    doc.setFontSize(11);
    doc.setTextColor(...corTitulo);
    doc.text(formatarDataBonita(dataISO), 10, y);
    quebraLinha(5);

    doc.setFontSize(9);
    doc.setTextColor(...corTexto);

    lista.forEach(t => {
      const sinal = t.tipo === "entrada" ? "+" : "-";
      const fator = t.tipo === "entrada" ? 1 : -1;
      totalDia += fator * t.valor;

      let nome;
      if (t.tipo === "saida" && t.estabelecimento) {
        nome = `${t.estabelecimento} / ${t.descricao}`;
      } else {
        nome = t.descricao;
      }

      const valorStr = formatarValorReal(t.valor);
      const xValor = 200 - 10;

      // descrição
      doc.setTextColor(...corTexto);
      doc.text(nome, 12, y);

      // valor colorido
      if (fator === 1) {
        doc.setTextColor(...corPositivo);
        doc.text("+" + valorStr, xValor, y, { align: "right" });
      } else {
        doc.setTextColor(...corNegativo);
        doc.text("-" + valorStr, xValor, y, { align: "right" });
      }

      quebraLinha(5);
    });

    // total do dia
    const totalDiaAbs = Math.abs(totalDia);
    const totalDiaStr = formatarValorReal(totalDiaAbs);
    const xValorDia = 200 - 10;

    doc.setTextColor(...corTexto);
    doc.text("Total do dia:", 12, y);

    if (totalDia >= 0) {
      doc.setTextColor(...corPositivo);
      doc.text("+" + totalDiaStr, xValorDia, y, { align: "right" });
    } else {
      doc.setTextColor(...corNegativo);
      doc.text("-" + totalDiaStr, xValorDia, y, { align: "right" });
    }

    totalGeral += totalDia;
    quebraLinha(6);

    // linha separadora
    doc.setDrawColor(...corLinha);
    doc.line(10, y, 200, y);
    quebraLinha(4);
  });

  // Total geral
  const totalGeralAbs = Math.abs(totalGeral);
  const totalGeralStr = formatarValorReal(totalGeralAbs);

  if (y > 260) {
    doc.addPage();
    y = 20;
  }

  doc.setFontSize(12);
  doc.setTextColor(...corTitulo);
  doc.text("Total geral:", 12, y);

  const xValorGeral = 200 - 10;
  if (totalGeral >= 0) {
    doc.setTextColor(...corPositivo);
    doc.text("+" + totalGeralStr, xValorGeral, y, { align: "right" });
  } else {
    doc.setTextColor(...corNegativo);
    doc.text("-" + totalGeralStr, xValorGeral, y, { align: "right" });
  }

  const nomeArquivo = mesSel
    ? `relatorio-muzis-${String(mesSel).padStart(2,"0")}-${ano}.pdf`
    : `relatorio-muzis-${ano}.pdf`;

  try {
    const blobUrl = doc.output("bloburl");
    window.open(blobUrl, "_blank");
  } catch (e) {
    doc.save(nomeArquivo);
  }

  fecharModalRelatorio();
}

// =========================
// Firestore listeners
// =========================

function observarTransacoes() {
  db.collection("transacoes")
    .orderBy("dataISO")
    .onSnapshot((snapshot) => {
      const novas = [];
      snapshot.forEach((doc) => {
        novas.push({ id: doc.id, ...doc.data() });
      });
      transacoes = novas;
      atualizarMovimentoHoje();
      renderizarListaDiaria();
      renderizarContas();
    }, (err) => {
      console.error("Erro ao ouvir transações:", err);
    });
}

function observarContas() {
  db.collection("contas")
    .orderBy("descricao")
    .onSnapshot((snapshot) => {
      const novas = [];
      snapshot.forEach((doc) => {
        novas.push({ id: doc.id, ...doc.data() });
      });
      contas = novas;
      preencherSelectContas();
      renderizarContas();
    }, (err) => {
      console.error("Erro ao ouvir contas:", err);
    });
}

// =========================
// Eventos de relatório
// =========================

btnRelatorio.addEventListener("click", abrirModalRelatorio);
btnModalRelatorioFechar.addEventListener("click", fecharModalRelatorio);
btnGerarRelatorio.addEventListener("click", gerarRelatorio);

// =========================
// Start
// =========================

inicializarDatas();
atualizarVisibilidadeContaPredefinida();
observarContas();
observarTransacoes();