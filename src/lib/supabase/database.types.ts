export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          acao: string
          changes_json: Json | null
          feito_em: string
          feito_por: string | null
          id: string
          registro_id: string
          status_anterior: string | null
          status_novo: string | null
          tabela: string
        }
        Insert: {
          acao: string
          changes_json?: Json | null
          feito_em?: string
          feito_por?: string | null
          id?: string
          registro_id: string
          status_anterior?: string | null
          status_novo?: string | null
          tabela: string
        }
        Update: {
          acao?: string
          changes_json?: Json | null
          feito_em?: string
          feito_por?: string | null
          id?: string
          registro_id?: string
          status_anterior?: string | null
          status_novo?: string | null
          tabela?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_feito_por_fkey"
            columns: ["feito_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      classificacoes: {
        Row: {
          ativo: boolean
          criado_em: string
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      contagem_linhas: {
        Row: {
          atualizado_em: string
          contagem_id: string
          criado_em: string
          enviado_em: string | null
          enviado_linha_id: string | null
          enviado_solicitacao_id: string | null
          id: string
          item_id: string | null
          observacao: string | null
          observacao_solicitacao: string | null
          ordem: number
          quantidade: number | null
          secao: string | null
          solicitacao_qtd: number | null
          texto: string
        }
        Insert: {
          atualizado_em?: string
          contagem_id: string
          criado_em?: string
          enviado_em?: string | null
          enviado_linha_id?: string | null
          enviado_solicitacao_id?: string | null
          id?: string
          item_id?: string | null
          observacao?: string | null
          observacao_solicitacao?: string | null
          ordem: number
          quantidade?: number | null
          secao?: string | null
          solicitacao_qtd?: number | null
          texto: string
        }
        Update: {
          atualizado_em?: string
          contagem_id?: string
          criado_em?: string
          enviado_em?: string | null
          enviado_linha_id?: string | null
          enviado_solicitacao_id?: string | null
          id?: string
          item_id?: string | null
          observacao?: string | null
          observacao_solicitacao?: string | null
          ordem?: number
          quantidade?: number | null
          secao?: string | null
          solicitacao_qtd?: number | null
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "contagem_linhas_contagem_id_fkey"
            columns: ["contagem_id"]
            isOneToOne: false
            referencedRelation: "contagens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contagem_linhas_enviado_linha_id_fkey"
            columns: ["enviado_linha_id"]
            isOneToOne: false
            referencedRelation: "solicitacao_linhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contagem_linhas_enviado_solicitacao_id_fkey"
            columns: ["enviado_solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solicitacoes_semanais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contagem_linhas_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "itens"
            referencedColumns: ["id"]
          },
        ]
      }
      contagens: {
        Row: {
          atualizado_em: string
          criado_em: string
          criado_por: string | null
          data_contagem: string
          finalizada: boolean
          finalizada_em: string | null
          id: string
          nome: string | null
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          data_contagem?: string
          finalizada?: boolean
          finalizada_em?: string | null
          id?: string
          nome?: string | null
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          data_contagem?: string
          finalizada?: boolean
          finalizada_em?: string | null
          id?: string
          nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contagens_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      enderecos_poa: {
        Row: {
          lat: number
          lon: number
          numero: number
          rua: string
        }
        Insert: {
          lat: number
          lon: number
          numero: number
          rua: string
        }
        Update: {
          lat?: number
          lon?: number
          numero?: number
          rua?: string
        }
        Relationships: []
      }
      entrega_log: {
        Row: {
          acao: string
          criado_em: string
          dados_antes: Json | null
          dados_depois: Json | null
          entrega_id: string
          id: string
          usuario_id: string | null
        }
        Insert: {
          acao: string
          criado_em?: string
          dados_antes?: Json | null
          dados_depois?: Json | null
          entrega_id: string
          id?: string
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          criado_em?: string
          dados_antes?: Json | null
          dados_depois?: Json | null
          entrega_id?: string
          id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entrega_log_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "entregas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entrega_log_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      entregas: {
        Row: {
          area_entrega: number | null
          assinatura_cliente_url: string | null
          atualizado_em: string
          bairro: string | null
          checkin_at: string | null
          cidade: string | null
          cliente_nome: string | null
          cliente_telefone: string | null
          codigo_queops: string
          contato_nome: string | null
          created_by: string | null
          criado_em: string
          custo_ocr_usd: number | null
          data_entrega: string
          endereco_complemento: string | null
          endereco_numero: string | null
          endereco_rua: string | null
          entrega_lat: number | null
          entrega_lng: number | null
          entrega_precisao_metros: number | null
          entregue_at: string | null
          foto_comprovante_url: string | null
          foto_pedido_original_url: string | null
          gps_negado: boolean
          hora_entrega: string | null
          id: string
          itens_json: Json | null
          motivo_nao_entrega: string | null
          motorista_id: string | null
          observacoes: string | null
          status: string
          total_fisico: number | null
          uf: string | null
          valor_total: number
        }
        Insert: {
          area_entrega?: number | null
          assinatura_cliente_url?: string | null
          atualizado_em?: string
          bairro?: string | null
          checkin_at?: string | null
          cidade?: string | null
          cliente_nome?: string | null
          cliente_telefone?: string | null
          codigo_queops: string
          contato_nome?: string | null
          created_by?: string | null
          criado_em?: string
          custo_ocr_usd?: number | null
          data_entrega?: string
          endereco_complemento?: string | null
          endereco_numero?: string | null
          endereco_rua?: string | null
          entrega_lat?: number | null
          entrega_lng?: number | null
          entrega_precisao_metros?: number | null
          entregue_at?: string | null
          foto_comprovante_url?: string | null
          foto_pedido_original_url?: string | null
          gps_negado?: boolean
          hora_entrega?: string | null
          id?: string
          itens_json?: Json | null
          motivo_nao_entrega?: string | null
          motorista_id?: string | null
          observacoes?: string | null
          status?: string
          total_fisico?: number | null
          uf?: string | null
          valor_total?: number
        }
        Update: {
          area_entrega?: number | null
          assinatura_cliente_url?: string | null
          atualizado_em?: string
          bairro?: string | null
          checkin_at?: string | null
          cidade?: string | null
          cliente_nome?: string | null
          cliente_telefone?: string | null
          codigo_queops?: string
          contato_nome?: string | null
          created_by?: string | null
          criado_em?: string
          custo_ocr_usd?: number | null
          data_entrega?: string
          endereco_complemento?: string | null
          endereco_numero?: string | null
          endereco_rua?: string | null
          entrega_lat?: number | null
          entrega_lng?: number | null
          entrega_precisao_metros?: number | null
          entregue_at?: string | null
          foto_comprovante_url?: string | null
          foto_pedido_original_url?: string | null
          gps_negado?: boolean
          hora_entrega?: string | null
          id?: string
          itens_json?: Json | null
          motivo_nao_entrega?: string | null
          motorista_id?: string | null
          observacoes?: string | null
          status?: string
          total_fisico?: number | null
          uf?: string | null
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "entregas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entregas_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ficha_item: {
        Row: {
          ficha_id: string
          id: string
          item_id: string | null
          merma_percent: number
          observacoes: string | null
          ordem: number
          produto_referenciado_id: string | null
          quantidade: number
        }
        Insert: {
          ficha_id: string
          id?: string
          item_id?: string | null
          merma_percent?: number
          observacoes?: string | null
          ordem?: number
          produto_referenciado_id?: string | null
          quantidade: number
        }
        Update: {
          ficha_id?: string
          id?: string
          item_id?: string | null
          merma_percent?: number
          observacoes?: string | null
          ordem?: number
          produto_referenciado_id?: string | null
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "ficha_item_ficha_id_fkey"
            columns: ["ficha_id"]
            isOneToOne: false
            referencedRelation: "ficha_tecnica"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ficha_item_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ficha_item_produto_referenciado_id_fkey"
            columns: ["produto_referenciado_id"]
            isOneToOne: false
            referencedRelation: "produto"
            referencedColumns: ["id"]
          },
        ]
      }
      ficha_tecnica: {
        Row: {
          criado_em: string
          criado_por: string | null
          data_vigencia_fim: string | null
          data_vigencia_inicio: string
          id: string
          observacoes: string | null
          produto_id: string
          versao: number
          vigente: boolean
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          data_vigencia_fim?: string | null
          data_vigencia_inicio?: string
          id?: string
          observacoes?: string | null
          produto_id: string
          versao: number
          vigente?: boolean
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          data_vigencia_fim?: string | null
          data_vigencia_inicio?: string
          id?: string
          observacoes?: string | null
          produto_id?: string
          versao?: number
          vigente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ficha_tecnica_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ficha_tecnica_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produto"
            referencedColumns: ["id"]
          },
        ]
      }
      formas_pagamento: {
        Row: {
          ativo: boolean
          criado_em: string
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      fornecedores: {
        Row: {
          ativo: boolean
          criado_em: string
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      itens: {
        Row: {
          ativo: boolean
          atualizado_em: string
          classificacao_id: string | null
          codigo_queops: string | null
          criado_em: string
          embalagem_compra_nome: string | null
          fator_conversao_ficha: number | null
          forma_pagto_padrao_id: string | null
          fornecedor_padrao_id: string | null
          id: string
          merged_into_id: string | null
          mrp_revisado: boolean
          nome: string
          prazo_padrao: string | null
          preco_referencia: number | null
          qtd_por_embalagem: number
          unidade_ficha: string | null
          unidade_id: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          classificacao_id?: string | null
          codigo_queops?: string | null
          criado_em?: string
          embalagem_compra_nome?: string | null
          fator_conversao_ficha?: number | null
          forma_pagto_padrao_id?: string | null
          fornecedor_padrao_id?: string | null
          id?: string
          merged_into_id?: string | null
          mrp_revisado?: boolean
          nome: string
          prazo_padrao?: string | null
          preco_referencia?: number | null
          qtd_por_embalagem?: number
          unidade_ficha?: string | null
          unidade_id?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          classificacao_id?: string | null
          codigo_queops?: string | null
          criado_em?: string
          embalagem_compra_nome?: string | null
          fator_conversao_ficha?: number | null
          forma_pagto_padrao_id?: string | null
          fornecedor_padrao_id?: string | null
          id?: string
          merged_into_id?: string | null
          mrp_revisado?: boolean
          nome?: string
          prazo_padrao?: string | null
          preco_referencia?: number | null
          qtd_por_embalagem?: number
          unidade_ficha?: string | null
          unidade_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "itens_classificacao_id_fkey"
            columns: ["classificacao_id"]
            isOneToOne: false
            referencedRelation: "classificacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_forma_pagto_padrao_id_fkey"
            columns: ["forma_pagto_padrao_id"]
            isOneToOne: false
            referencedRelation: "formas_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_fornecedor_padrao_id_fkey"
            columns: ["fornecedor_padrao_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades_medida"
            referencedColumns: ["id"]
          },
        ]
      }
      motoboy_relatorios: {
        Row: {
          corridas: Json
          id: string
          importado_em: string
          importado_por: string | null
          km_total: number | null
          n_corridas: number | null
        }
        Insert: {
          corridas: Json
          id?: string
          importado_em?: string
          importado_por?: string | null
          km_total?: number | null
          n_corridas?: number | null
        }
        Update: {
          corridas?: Json
          id?: string
          importado_em?: string
          importado_por?: string | null
          km_total?: number | null
          n_corridas?: number | null
        }
        Relationships: []
      }
      produto: {
        Row: {
          ativo: boolean
          atualizado_em: string
          categoria: string
          codigo_queops: string | null
          criado_em: string
          criado_por: string | null
          id: string
          nome: string
          rendimento_padrao: number
          tipo: string
          unidade_producao: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          categoria?: string
          codigo_queops?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          nome: string
          rendimento_padrao?: number
          tipo?: string
          unidade_producao?: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          categoria?: string
          codigo_queops?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          nome?: string
          rendimento_padrao?: number
          tipo?: string
          unidade_producao?: string
        }
        Relationships: [
          {
            foreignKeyName: "produto_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ativo: boolean
          criado_em: string
          id: string
          nome: string
          role: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          id: string
          nome: string
          role: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          id?: string
          nome?: string
          role?: string
        }
        Relationships: []
      }
      projecao_demanda: {
        Row: {
          id: string
          observacoes: string | null
          produto_id: string
          projecao_id: string
          quantidade: number
        }
        Insert: {
          id?: string
          observacoes?: string | null
          produto_id: string
          projecao_id: string
          quantidade: number
        }
        Update: {
          id?: string
          observacoes?: string | null
          produto_id?: string
          projecao_id?: string
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "projecao_demanda_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projecao_demanda_projecao_id_fkey"
            columns: ["projecao_id"]
            isOneToOne: false
            referencedRelation: "projecao_producao"
            referencedColumns: ["id"]
          },
        ]
      }
      projecao_necessidade: {
        Row: {
          alertas: Json | null
          estoque_atual: number
          id: string
          item_id: string
          necessidade_bruta: number
          necessidade_liquida: number
          projecao_id: string
          quantidade_a_comprar: number
          unidade: string | null
        }
        Insert: {
          alertas?: Json | null
          estoque_atual?: number
          id?: string
          item_id: string
          necessidade_bruta?: number
          necessidade_liquida?: number
          projecao_id: string
          quantidade_a_comprar?: number
          unidade?: string | null
        }
        Update: {
          alertas?: Json | null
          estoque_atual?: number
          id?: string
          item_id?: string
          necessidade_bruta?: number
          necessidade_liquida?: number
          projecao_id?: string
          quantidade_a_comprar?: number
          unidade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projecao_necessidade_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projecao_necessidade_projecao_id_fkey"
            columns: ["projecao_id"]
            isOneToOne: false
            referencedRelation: "projecao_producao"
            referencedColumns: ["id"]
          },
        ]
      }
      projecao_producao: {
        Row: {
          atualizado_em: string
          contagem_id: string | null
          criado_em: string
          criado_por: string | null
          data_calculo: string
          id: string
          observacoes: string | null
          semana_fim: string
          semana_inicio: string
          solicitacao_id: string | null
          status: string
        }
        Insert: {
          atualizado_em?: string
          contagem_id?: string | null
          criado_em?: string
          criado_por?: string | null
          data_calculo?: string
          id?: string
          observacoes?: string | null
          semana_fim: string
          semana_inicio: string
          solicitacao_id?: string | null
          status?: string
        }
        Update: {
          atualizado_em?: string
          contagem_id?: string | null
          criado_em?: string
          criado_por?: string | null
          data_calculo?: string
          id?: string
          observacoes?: string | null
          semana_fim?: string
          semana_inicio?: string
          solicitacao_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "projecao_producao_contagem_id_fkey"
            columns: ["contagem_id"]
            isOneToOne: false
            referencedRelation: "contagens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projecao_producao_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projecao_producao_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solicitacoes_semanais"
            referencedColumns: ["id"]
          },
        ]
      }
      recebimento_entregas: {
        Row: {
          criado_em: string
          criado_por: string | null
          data_recebimento: string
          id: string
          linha_id: string
          observacao: string | null
          quantidade: number
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          data_recebimento: string
          id?: string
          linha_id: string
          observacao?: string | null
          quantidade: number
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          data_recebimento?: string
          id?: string
          linha_id?: string
          observacao?: string | null
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "recebimento_entregas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recebimento_entregas_linha_id_fkey"
            columns: ["linha_id"]
            isOneToOne: false
            referencedRelation: "solicitacao_linhas"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacao_linhas: {
        Row: {
          alteracao_confirmada: boolean
          aprovado_em: string | null
          aprovado_por: string | null
          atualizado_em: string
          classificacao_congelada: string | null
          codigo_queops_congelado: string | null
          criado_em: string
          data_compra: string | null
          data_recebimento: string | null
          duplicata_legada: boolean
          forma_pagto_id: string | null
          fornecedor_id: string | null
          id: string
          item_id: string
          nome_item_congelado: string | null
          observacao_recebimento: string | null
          observacoes: string | null
          prazo: string | null
          preco: number
          preco_corrigido_em: string | null
          preco_corrigido_por: string | null
          recebido_em: string | null
          recebido_por: string | null
          solicitacao_id: string
          status: Database["public"]["Enums"]["status_linha"]
          unidade_congelada: string | null
          valor: number | null
          vencimento: string | null
          volume_estoque: number | null
          volume_recebido: number | null
          volume_solicitado: number
        }
        Insert: {
          alteracao_confirmada?: boolean
          aprovado_em?: string | null
          aprovado_por?: string | null
          atualizado_em?: string
          classificacao_congelada?: string | null
          codigo_queops_congelado?: string | null
          criado_em?: string
          data_compra?: string | null
          data_recebimento?: string | null
          duplicata_legada?: boolean
          forma_pagto_id?: string | null
          fornecedor_id?: string | null
          id?: string
          item_id: string
          nome_item_congelado?: string | null
          observacao_recebimento?: string | null
          observacoes?: string | null
          prazo?: string | null
          preco?: number
          preco_corrigido_em?: string | null
          preco_corrigido_por?: string | null
          recebido_em?: string | null
          recebido_por?: string | null
          solicitacao_id: string
          status?: Database["public"]["Enums"]["status_linha"]
          unidade_congelada?: string | null
          valor?: number | null
          vencimento?: string | null
          volume_estoque?: number | null
          volume_recebido?: number | null
          volume_solicitado?: number
        }
        Update: {
          alteracao_confirmada?: boolean
          aprovado_em?: string | null
          aprovado_por?: string | null
          atualizado_em?: string
          classificacao_congelada?: string | null
          codigo_queops_congelado?: string | null
          criado_em?: string
          data_compra?: string | null
          data_recebimento?: string | null
          duplicata_legada?: boolean
          forma_pagto_id?: string | null
          fornecedor_id?: string | null
          id?: string
          item_id?: string
          nome_item_congelado?: string | null
          observacao_recebimento?: string | null
          observacoes?: string | null
          prazo?: string | null
          preco?: number
          preco_corrigido_em?: string | null
          preco_corrigido_por?: string | null
          recebido_em?: string | null
          recebido_por?: string | null
          solicitacao_id?: string
          status?: Database["public"]["Enums"]["status_linha"]
          unidade_congelada?: string | null
          valor?: number | null
          vencimento?: string | null
          volume_estoque?: number | null
          volume_recebido?: number | null
          volume_solicitado?: number
        }
        Relationships: [
          {
            foreignKeyName: "solicitacao_linhas_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacao_linhas_forma_pagto_id_fkey"
            columns: ["forma_pagto_id"]
            isOneToOne: false
            referencedRelation: "formas_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacao_linhas_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacao_linhas_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacao_linhas_preco_corrigido_por_fkey"
            columns: ["preco_corrigido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacao_linhas_recebido_por_fkey"
            columns: ["recebido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacao_linhas_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solicitacoes_semanais"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacoes_semanais: {
        Row: {
          atualizado_em: string
          comprador_id: string
          contagem_id: string | null
          criado_em: string
          data_fim: string
          data_inicio: string
          enviada_em: string | null
          finalizada: boolean
          finalizada_em: string | null
          id: string
          observacoes: string | null
          origem: string | null
          projecao_id: string | null
        }
        Insert: {
          atualizado_em?: string
          comprador_id: string
          contagem_id?: string | null
          criado_em?: string
          data_fim: string
          data_inicio: string
          enviada_em?: string | null
          finalizada?: boolean
          finalizada_em?: string | null
          id?: string
          observacoes?: string | null
          origem?: string | null
          projecao_id?: string | null
        }
        Update: {
          atualizado_em?: string
          comprador_id?: string
          contagem_id?: string | null
          criado_em?: string
          data_fim?: string
          data_inicio?: string
          enviada_em?: string | null
          finalizada?: boolean
          finalizada_em?: string | null
          id?: string
          observacoes?: string | null
          origem?: string | null
          projecao_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_semanais_comprador_id_fkey"
            columns: ["comprador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_semanais_contagem_id_fkey"
            columns: ["contagem_id"]
            isOneToOne: false
            referencedRelation: "contagens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_semanais_projecao_id_fkey"
            columns: ["projecao_id"]
            isOneToOne: false
            referencedRelation: "projecao_producao"
            referencedColumns: ["id"]
          },
        ]
      }
      template_itens: {
        Row: {
          criado_em: string
          id: string
          item_id: string | null
          ordem: number
          secao: string | null
          template_id: string
          texto: string
        }
        Insert: {
          criado_em?: string
          id?: string
          item_id?: string | null
          ordem: number
          secao?: string | null
          template_id: string
          texto: string
        }
        Update: {
          criado_em?: string
          id?: string
          item_id?: string | null
          ordem?: number
          secao?: string | null
          template_id?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_itens_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_itens_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates_contagem"
            referencedColumns: ["id"]
          },
        ]
      }
      templates_contagem: {
        Row: {
          ativo: boolean
          criado_em: string
          descricao: string | null
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          descricao?: string | null
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          descricao?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      unidades_medida: {
        Row: {
          ativo: boolean
          criado_em: string
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      vendas_cliente_apelidos: {
        Row: {
          cadastro_original: string
          cliente_id: string
          codigo_queops: string | null
          criado_em: string
          endereco: string | null
          id: string
          reconhecido: boolean
          telefone: string | null
        }
        Insert: {
          cadastro_original: string
          cliente_id: string
          codigo_queops?: string | null
          criado_em?: string
          endereco?: string | null
          id?: string
          reconhecido?: boolean
          telefone?: string | null
        }
        Update: {
          cadastro_original?: string
          cliente_id?: string
          codigo_queops?: string | null
          criado_em?: string
          endereco?: string | null
          id?: string
          reconhecido?: boolean
          telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendas_cliente_apelidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vendas_clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas_clientes: {
        Row: {
          ativo: boolean
          atualizado_em: string
          canal_preferido: string | null
          codigo_cliente: string
          contatar_3dias: boolean
          criado_em: string
          data_prevista_compra: string | null
          endereco: string | null
          frequencia_classe: string | null
          frequencia_compras: number
          id: string
          intervalo_mediano_dias: number | null
          itens_habituais: Json | null
          motivo_contato: string | null
          motivo_verificar: string | null
          nome: string
          observacoes: string | null
          primeira_compra: string | null
          receita_anual_risco: number | null
          status: string
          telefone_e164: string | null
          telefone_presumido: boolean
          telefone_raw: string | null
          ticket_medio: number
          tipo_telefone: string | null
          total_vendas: number
          ultima_compra: string | null
          verificar: boolean
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          canal_preferido?: string | null
          codigo_cliente: string
          contatar_3dias?: boolean
          criado_em?: string
          data_prevista_compra?: string | null
          endereco?: string | null
          frequencia_classe?: string | null
          frequencia_compras?: number
          id?: string
          intervalo_mediano_dias?: number | null
          itens_habituais?: Json | null
          motivo_contato?: string | null
          motivo_verificar?: string | null
          nome: string
          observacoes?: string | null
          primeira_compra?: string | null
          receita_anual_risco?: number | null
          status?: string
          telefone_e164?: string | null
          telefone_presumido?: boolean
          telefone_raw?: string | null
          ticket_medio?: number
          tipo_telefone?: string | null
          total_vendas?: number
          ultima_compra?: string | null
          verificar?: boolean
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          canal_preferido?: string | null
          codigo_cliente?: string
          contatar_3dias?: boolean
          criado_em?: string
          data_prevista_compra?: string | null
          endereco?: string | null
          frequencia_classe?: string | null
          frequencia_compras?: number
          id?: string
          intervalo_mediano_dias?: number | null
          itens_habituais?: Json | null
          motivo_contato?: string | null
          motivo_verificar?: string | null
          nome?: string
          observacoes?: string | null
          primeira_compra?: string | null
          receita_anual_risco?: number | null
          status?: string
          telefone_e164?: string | null
          telefone_presumido?: boolean
          telefone_raw?: string | null
          ticket_medio?: number
          tipo_telefone?: string | null
          total_vendas?: number
          ultima_compra?: string | null
          verificar?: boolean
        }
        Relationships: []
      }
      vendas_contatos: {
        Row: {
          adiar_ate: string | null
          canal: string | null
          cliente_id: string
          criado_em: string
          id: string
          motivo: string | null
          observacao: string | null
          resultado: string | null
          usuario_id: string | null
        }
        Insert: {
          adiar_ate?: string | null
          canal?: string | null
          cliente_id: string
          criado_em?: string
          id?: string
          motivo?: string | null
          observacao?: string | null
          resultado?: string | null
          usuario_id?: string | null
        }
        Update: {
          adiar_ate?: string | null
          canal?: string | null
          cliente_id?: string
          criado_em?: string
          id?: string
          motivo?: string | null
          observacao?: string | null
          resultado?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendas_contatos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vendas_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_contatos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas_import_mapeamentos: {
        Row: {
          atualizado_em: string
          colunas: Json
          criado_em: string
          criado_por: string | null
          id: string
          nome: string
        }
        Insert: {
          atualizado_em?: string
          colunas: Json
          criado_em?: string
          criado_por?: string | null
          id?: string
          nome: string
        }
        Update: {
          atualizado_em?: string
          colunas?: Json
          criado_em?: string
          criado_por?: string | null
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendas_import_mapeamentos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas_importacoes: {
        Row: {
          arquivo_nome: string | null
          avisos: Json | null
          cadastros_a_verificar: number
          clientes_novos: number
          id: string
          importado_em: string
          importado_por: string | null
          pedidos_ignorados: number
          pedidos_novos: number
          periodo_fim: string | null
          periodo_inicio: string | null
        }
        Insert: {
          arquivo_nome?: string | null
          avisos?: Json | null
          cadastros_a_verificar?: number
          clientes_novos?: number
          id?: string
          importado_em?: string
          importado_por?: string | null
          pedidos_ignorados?: number
          pedidos_novos?: number
          periodo_fim?: string | null
          periodo_inicio?: string | null
        }
        Update: {
          arquivo_nome?: string | null
          avisos?: Json | null
          cadastros_a_verificar?: number
          clientes_novos?: number
          id?: string
          importado_em?: string
          importado_por?: string | null
          pedidos_ignorados?: number
          pedidos_novos?: number
          periodo_fim?: string | null
          periodo_inicio?: string | null
        }
        Relationships: []
      }
      vendas_itens: {
        Row: {
          eh_produto: boolean
          id: number
          pedido: string
          produto: string
          qtd: number | null
          valor: number | null
        }
        Insert: {
          eh_produto?: boolean
          id?: number
          pedido: string
          produto: string
          qtd?: number | null
          valor?: number | null
        }
        Update: {
          eh_produto?: boolean
          id?: number
          pedido?: string
          produto?: string
          qtd?: number | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vendas_itens_pedido_fkey"
            columns: ["pedido"]
            isOneToOne: false
            referencedRelation: "vendas_pedidos"
            referencedColumns: ["pedido"]
          },
        ]
      }
      vendas_pedidos: {
        Row: {
          atendente: string | null
          cliente_id: string | null
          criado_em: string
          data: string
          eh_valido: boolean | null
          forma_pag: string | null
          importacao_id: string | null
          pedido: string
          total: number
        }
        Insert: {
          atendente?: string | null
          cliente_id?: string | null
          criado_em?: string
          data: string
          eh_valido?: boolean | null
          forma_pag?: string | null
          importacao_id?: string | null
          pedido: string
          total?: number
        }
        Update: {
          atendente?: string | null
          cliente_id?: string | null
          criado_em?: string
          data?: string
          eh_valido?: boolean | null
          forma_pag?: string | null
          importacao_id?: string | null
          pedido?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "vendas_pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vendas_clientes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      contagens_resumo: {
        Row: {
          contagem_id: string | null
          preenchidas: number | null
          total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contagem_linhas_contagem_id_fkey"
            columns: ["contagem_id"]
            isOneToOne: false
            referencedRelation: "contagens"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacoes_resumo: {
        Row: {
          linhas: number | null
          pendentes_aprovacao: number | null
          pendentes_recebimento: number | null
          solicitacao_id: string | null
          valor: number | null
        }
        Relationships: [
          {
            foreignKeyName: "solicitacao_linhas_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solicitacoes_semanais"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      bulk_aprovar: {
        Args: { p_solic_id: string }
        Returns: {
          aprovadas: number
          erros: number
          pulados_sem_codigo: number
        }[]
      }
      current_user_role: { Args: never; Returns: string }
      recalcular_frequencia_classe: { Args: never; Returns: number }
      recalcular_itens_habituais: { Args: never; Returns: number }
      recalcular_metricas_vendas: { Args: never; Returns: number }
      tem_papel_vendas: { Args: { papeis: string[] }; Returns: boolean }
      vendas_oportunidades: {
        Args: never
        Returns: {
          cliente_id: string
          dias_sem_pedir: number
          produto: string
          vezes: number
        }[]
      }
    }
    Enums: {
      status_linha:
        | "Para Aprovar"
        | "Aprovada"
        | "Aprovada & Recebida"
        | "Recusada"
        | "Volumes ou Preço Alterados"
        | "Não Entregue"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      status_linha: [
        "Para Aprovar",
        "Aprovada",
        "Aprovada & Recebida",
        "Recusada",
        "Volumes ou Preço Alterados",
        "Não Entregue",
      ],
    },
  },
} as const

