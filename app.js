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

// Máscara tipo "digita e vai jogando para casas decimais"
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

// Converte string "1.234,56" => 1234.56
function parseMoedaBR(str) {
  if (!str) return 0;
  const limpo = str.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(limpo);
  return isNaN(n) ? 0 : n;
}

// =========================
// Estado em memória
// =========================

let transacoes = []; // {id, tipo, valor, descricao, dataISO, contaId, parcelaIndex}
let contas = [];     // {id, descricao, valorTotal, qtdParcelas, primeiraDataISO}

// controle de exclusão de conta
let modoExclusaoContas = false;
let contaPendenteExclusaoId = null;

// =========================
// Elementos da UI
// =========================

const spanDataHoje = document.getElementById("data-hoje");
const spanMovimentoHoje = document.getElementById("movimento-hoje");

const formLancamento = document.getElementById("form-lancamento");
const inputTipo = document.getElementById("tipo");
const inputValor = document.getElementById("valor");
const inputDescricao = document.getElementById("descricao");
const inputDataLancamento = document.getElementById("data-lancamento");

const campoContaPredefinida = document.getElementById("campo-conta-predefinida");
const campoParcelaConta = document.getElementById("campo-parcela-conta");
const selectContaPredefinida = document.getElementById("conta-predefinida-select");
const selectParcelaConta = document.getElementById("parcela-conta-select");

const inputDataConsulta = document.getElementById("data-consulta");
const listaDiaria = document.getElementById("lista-diaria");

// Contas
const btnContaAdd = document.getElementById("btn-conta-add");
const btnContaDelMode = document.getElementById("btn-conta-del-mode");
const inputFiltroMesAno = document.getElementById("filtro-mes-ano");
const listaContas = document.getElementById("lista-contas");

// Modal conta
const modalConta = document.getElementById("modal-conta");
const btnModalContaFechar = document.getElementById("modal-conta-fechar");
const formConta = document.getElementById("form-conta");
const inputContaDescricao = document.getElementById("conta-descricao");
const inputContaValorTotal = document.getElementById("conta-valor-total");
const inputContaQtdParcelas = document.getElementById("conta-qtd-parcelas");
const inputContaValorParcela = document.getElementById("conta-valor-parcela");
const inputContaPrimeiraData = document.getElementById("conta-primeira-data");

// Modal exclusão
const modalConfirmaExclusao = document.getElementById("modal-confirma-excluir");
const btnCancelarExclusao = document.getElementById("btn-cancelar-exclusao");
const btnConfirmarExclusao = document.getElementById("btn-confirmar-exclusao");

// =========================
// Inicialização básica
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

// Mostrar/ocultar campos de conta predefinida
function atualizarVisibilidadeContaPredefinida() {
  const tipo = inputTipo.value;
  const mostrar = tipo === "conta";
  campoContaPredefinida.style.display = mostrar ? "flex" : "none";
  campoParcelaConta.style.display = mostrar ? "flex" : "none";
}

inicializarDatas();
atualizarVisibilidadeContaPredefinida();
atualizarMovimentoHoje();
renderizarListaDiaria();
renderizarContas();
preencherSelectContas();

// =========================
// Movimento do dia
// =========================

function atualizarMovimentoHoje() {
  const hoje = hojeISO();
  const mov = transacoes
    .filter(t => t.dataISO === hoje)
    .reduce((acc, t) => {
      if (t.tipo === "entrada") return acc + t.valor;
      return acc - t.valor; // saída ou conta
    }, 0);
  spanMovimentoHoje.textContent = formatarValorReal(mov);
}

// =========================
// Lançamentos
// =========================

inputValor.addEventListener("input", () => {
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

formLancamento.addEventListener("submit", (e) => {
  e.preventDefault();

  const tipo = inputTipo.value; // entrada, saida, conta
  const valor = parseMoedaBR(inputValor.value);
  if (!valor || valor <= 0) return;

  const descricao = inputDescricao.value.trim() || "(sem descrição)";
  const dataISO = inputDataLancamento.value || hojeISO();

  let contaId = null;
  let parcelaIndex = null;

  if (tipo === "conta") {
    contaId = selectContaPredefinida.value || null;
    parcelaIndex = selectParcelaConta.value ? parseInt(selectParcelaConta.value, 10) : null;
  }

  const transacao = {
    id: crypto.randomUUID(),
    tipo,
    valor,
    descricao,
    dataISO,
    contaId,
    parcelaIndex
  };

  transacoes.push(transacao);
  atualizarMovimentoHoje();
  renderizarListaDiaria();
  // No futuro: atualizar status de parcelas pagas aqui

  // Limpar campos principais
  inputValor.value = "0,00";
  inputDescricao.value = "";
});

// =========================
// Consulta diária
// =========================

inputDataConsulta.addEventListener("change", () => {
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
    divInfo.innerHTML = `
      <span>${t.descricao}</span>
      <span>${t.tipo === "entrada" ? "Entrada" : (t.tipo === "saida" ? "Saída" : "Conta predefinida")}</span>
    `;

    const spanValor = document.createElement("span");
    spanValor.className = "mov-valor " + t.tipo;
    const sinal = t.tipo === "entrada" ? "+" : "-";
    spanValor.textContent = sinal + formatarValorReal(t.valor);

    li.appendChild(divInfo);
    li.appendChild(spanValor);
    listaDiaria.appendChild(li);
  });
}

// =========================
// Contas e parcelas (versão simples)
// =========================

btnContaAdd.addEventListener("click", () => {
  abrirModalConta();
});

btnContaDelMode.addEventListener("click", () => {
  modoExclusaoContas = !modoExclusaoContas;
  renderizarContas();
});

btnModalContaFechar.addEventListener("click", () => {
  fecharModalConta();
});

formConta.addEventListener("submit", (e) => {
  e.preventDefault();

  const descricao = inputContaDescricao.value.trim();
  if (!descricao) return;

  // não permitir descrições repetidas
  if (contas.some(c => c.descricao.toLowerCase() === descricao.toLowerCase())) {
    alert("Já existe uma conta com esta descrição.");
    return;
  }

  const valorTotal = parseMoedaBR(inputContaValorTotal.value);
  const qtdParcelas = parseInt(inputContaQtdParcelas.value || "1", 10);
  const primeiraDataISO = inputContaPrimeiraData.value || hojeISO();

  if (!valorTotal || valorTotal <= 0 || !qtdParcelas || qtdParcelas <= 0) return;

  const conta = {
    id: crypto.randomUUID(),
    descricao,
    valorTotal,
    qtdParcelas,
    primeiraDataISO
  };

  contas.push(conta);

  fecharModalConta();
  limparFormularioConta();
  preencherSelectContas();
  renderizarContas();
});

btnCancelarExclusao.addEventListener("click", () => {
  contaPendenteExclusaoId = null;
  fecharModalExclusao();
});

btnConfirmarExclusao.addEventListener("click", () => {
  if (contaPendenteExclusaoId) {
    contas = contas.filter(c => c.id !== contaPendenteExclusaoId);
    contaPendenteExclusaoId = null;
    preencherSelectContas();
    renderizarContas();
  }
  fecharModalExclusao();
});

inputFiltroMesAno.addEventListener("change", () => {
  renderizarContas();
});

function abrirModalConta() {
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

// Preenche select de contas predefinidas no lançamento
function preencherSelectContas() {
  selectContaPredefinida.innerHTML = `<option value="">— selecione —</option>`;
  contas.forEach(conta => {
    const opt = document.createElement("option");
    opt.value = conta.id;
    opt.textContent = conta.descricao;
    selectContaPredefinida.appendChild(opt);
  });
  preencherSelectParcelas();
}

selectContaPredefinida.addEventListener("change", preencherSelectParcelas);

function preencherSelectParcelas() {
  selectParcelaConta.innerHTML = `<option value="">— selecione —</option>`;

  const contaId = selectContaPredefinida.value;
  if (!contaId) return;

  const conta = contas.find(c => c.id === contaId);
  if (!conta) return;

  // Versão simples: deixa selecionar qualquer parcela ainda não paga.
  for (let i = 1; i <= conta.qtdParcelas; i++) {
    const opt = document.createElement("option");
    opt.value = i - 1; // index
    opt.textContent = `${i}ª parcela`;
    selectParcelaConta.appendChild(opt);
  }
}

// Gera lista de parcelas (sem toda regra de atraso ainda)
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
  const mesAno = inputFiltroMesAno.value; // "2025-02"
  if (!mesAno) return;

  const [anoFiltro, mesFiltro] = mesAno.split("-").map(v => parseInt(v, 10));

  contas.forEach(conta => {
    const parcelas = obterParcelasDaConta(conta);

    parcelas.forEach(parcela => {
      const data = new Date(parcela.dataISO);
      const ano = data.getFullYear();
      const mes = data.getMonth() + 1;

      if (ano !== anoFiltro || mes !== mesFiltro) return;

      const li = document.createElement("li");
      li.className = "item-conta";

      if (modoExclusaoContas) {
        li.style.transform = "translateX(0)";
      }

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
      // No futuro: marcar paga/atrasada baseado nas transações

      li.appendChild(divMain);

      if (modoExclusaoContas) {
        const btnDel = document.createElement("button");
        btnDel.className = "btn-icon";
        btnDel.textContent = "−";
        btnDel.addEventListener("click", () => {
          abrirModalExclusao(conta.id);
        });
        li.appendChild(btnDel);
      }

      listaContas.appendChild(li);
    });
  });
}
