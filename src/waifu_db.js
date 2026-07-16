'use strict';
// ══════════════════════════════════════════
//  waifu_db.js — base de datos de waifus + fuzzy matching
//  Extraído de interactions.js para reducir su tamaño.
// ══════════════════════════════════════════

const waifuDB = [
    // Re:Zero
    { key: 'rem', tag: 'rem_(re_zero)' }, { key: 'ram', tag: 'ram_(re_zero)' },
    { key: 'emilia', tag: 'emilia_(re_zero)' }, { key: 'beatrice', tag: 'beatrice_(re_zero)' },
    { key: 'echidna', tag: 'echidna_(re_zero)' }, { key: 'satella', tag: 'satella_(re_zero)' },
    // SAO
    { key: 'asuna', tag: 'asuna_(sao)' }, { key: 'suguha', tag: 'suguha_kirigaya' },
    { key: 'silica', tag: 'silica_(sao)' }, { key: 'sinon', tag: 'asada_shino' },
    { key: 'alice', tag: 'alice_schuberg' }, { key: 'yuuki', tag: 'yuuki_(sao)' },
    // AOT
    { key: 'mikasa', tag: 'mikasa_ackerman' }, { key: 'historia', tag: 'historia_reiss' },
    { key: 'annie', tag: 'annie_leonhardt' }, { key: 'sasha', tag: 'blouse_sasha' },
    { key: 'hange', tag: 'hange_zoe' }, { key: 'pieck', tag: 'pieck_finger' },
    // Naruto
    { key: 'hinata', tag: 'hyuuga_hinata' }, { key: 'sakura', tag: 'haruno_sakura' },
    { key: 'tsunade', tag: 'tsunade' }, { key: 'temari', tag: 'temari_(naruto)' },
    { key: 'konan', tag: 'konan_(naruto)' }, { key: 'kushina', tag: 'uzumaki_kushina' },
    // Demon Slayer
    { key: 'nezuko', tag: 'kamado_nezuko' }, { key: 'shinobu', tag: 'kochou_shinobu' },
    { key: 'mitsuri', tag: 'kanroji_mitsuri' }, { key: 'kanao', tag: 'tsuyuri_kanao' },
    { key: 'daki', tag: 'daki_(kimetsu)' },
    // JJK
    { key: 'nobara', tag: 'kugisaki_nobara' }, { key: 'maki', tag: 'zenin_maki' },
    { key: 'mai', tag: 'zenin_mai' }, { key: 'mei mei', tag: 'mei_mei_(jujutsu)' },
    { key: 'miwa', tag: 'miwa_kasumi' },
    // MHA
    { key: 'ochako', tag: 'uraraka_ochako' }, { key: 'tsuyu', tag: 'asui_tsuyu' },
    { key: 'momo', tag: 'yaoyorozu_momo' }, { key: 'toga', tag: 'toga_himiko' },
    { key: 'mirko', tag: 'usagiyama_rumi' }, { key: 'jirou', tag: 'jirou_kyouka' },
    { key: 'mina', tag: 'ashido_mina' }, { key: 'nejire', tag: 'hado_nejire' },
    // One Piece
    { key: 'nami', tag: 'nami_(one_piece)' }, { key: 'robin', tag: 'nico_robin' },
    { key: 'hancock', tag: 'boa_hancock' }, { key: 'yamato', tag: 'yamato_(one_piece)' },
    { key: 'carrot', tag: 'carrot_(one_piece)' },
    // Dragon Ball
    { key: 'bulma', tag: 'bulma' }, { key: 'android 18', tag: 'android_18' },
    { key: 'caulifla', tag: 'caulifla' }, { key: 'kale', tag: 'kale_(dragon_ball)' },
    { key: 'videl', tag: 'videl' },
    // Fate
    { key: 'saber', tag: 'saber_(fate)' }, { key: 'rin', tag: 'tohsaka_rin' },
    { key: 'illya', tag: 'illyasviel_von_einzbern' }, { key: 'artoria', tag: 'artoria_pendragon' },
    { key: 'tamamo', tag: 'tamamo_no_mae_(fate)' }, { key: 'scathach', tag: 'scathach_(fate)' },
    { key: 'nero', tag: 'nero_claudius_(fate)' }, { key: 'medusa', tag: 'medusa_(fate)' },
    { key: 'morgan', tag: 'morgan_le_fay_(fate)' },
    // Konosuba
    { key: 'aqua', tag: 'aqua_(konosuba)' }, { key: 'megumin', tag: 'megumin_(konosuba)' },
    { key: 'darkness', tag: 'lalatina_dustiness_ford' }, { key: 'yunyun', tag: 'yunyun_(konosuba)' },
    { key: 'wiz', tag: 'wiz_(konosuba)' }, { key: 'eris', tag: 'eris_(konosuba)' },
    // Spy x Family
    { key: 'yor', tag: 'yor_forger' }, { key: 'anya', tag: 'anya_forger' },
    // Date A Live
    { key: 'tohka', tag: 'yatogami_tohka' }, { key: 'kurumi', tag: 'tokisaki_kurumi' },
    { key: 'kotori', tag: 'itsuka_kotori' }, { key: 'yoshino', tag: 'yoshino_(date_a_live)' },
    { key: 'origami', tag: 'tobiichi_origami' }, { key: 'miku date', tag: 'izayoi_miku' },
    // Overlord
    { key: 'albedo', tag: 'albedo_(overlord)' }, { key: 'shalltear', tag: 'shalltear_bloodfallen' },
    // DITF
    { key: 'zero two', tag: 'zero_two_(darling_in_the_franxx)' }, { key: '02', tag: 'zero_two_(darling_in_the_franxx)' },
    { key: 'ichigo ditf', tag: 'ichigo_(darling_in_the_franxx)' },
    // Dragon Maid
    { key: 'tohru', tag: 'tohru_(kobayashi_dragon_maid)' }, { key: 'kanna', tag: 'kanna_kamui' },
    { key: 'lucoa', tag: 'quetzalcoatl_(dragon_maid)' }, { key: 'ilulu', tag: 'ilulu_(dragon_maid)' },
    // Quintuplets
    { key: 'nino', tag: 'nakano_nino' }, { key: 'miku nino', tag: 'nakano_miku' },
    { key: 'ichika', tag: 'nakano_ichika' }, { key: 'yotsuba', tag: 'nakano_yotsuba' },
    { key: 'itsuki', tag: 'nakano_itsuki' },
    // Genshin
    { key: 'lumine', tag: 'lumine_(genshin_impact)' }, { key: 'ganyu', tag: 'ganyu_(genshin_impact)' },
    { key: 'hu tao', tag: 'hu_tao_(genshin_impact)' }, { key: 'hutao', tag: 'hu_tao_(genshin_impact)' },
    { key: 'raiden', tag: 'raiden_shogun' },
    { key: 'raiden shogun', tag: 'raiden_shogun' }, { key: 'yae miko', tag: 'yae_miko' },
    { key: 'kokomi', tag: 'sangonomiya_kokomi' }, { key: 'fischl', tag: 'fischl_(genshin_impact)' },
    { key: 'eula', tag: 'eula_(genshin_impact)' }, { key: 'nahida', tag: 'nahida_(genshin_impact)' },
    { key: 'furina', tag: 'furina_(genshin_impact)' }, { key: 'nilou', tag: 'nilou_(genshin_impact)' },
    { key: 'shenhe', tag: 'shenhe_(genshin_impact)' }, { key: 'yelan', tag: 'yelan_(genshin_impact)' },
    { key: 'keqing', tag: 'keqing_(genshin_impact)' }, { key: 'ningguang', tag: 'ningguang_(genshin_impact)' },
    // Bleach
    { key: 'rukia', tag: 'kuchiki_rukia' }, { key: 'orihime', tag: 'inoue_orihime' },
    { key: 'yoruichi', tag: 'shihouin_yoruichi' }, { key: 'rangiku', tag: 'matsumoto_rangiku' },
    { key: 'nell', tag: 'nelliel_tu_odelschwanck' }, { key: 'unohana', tag: 'unohana_retsu' },
    // Fairy Tail
    { key: 'erza', tag: 'scarlet_erza' }, { key: 'lucy ft', tag: 'heartfilia_lucy' },
    { key: 'mirajane', tag: 'strauss_mirajane' }, { key: 'juvia', tag: 'lockser_juvia' },
    // Chainsaw Man
    { key: 'makima', tag: 'makima_(chainsaw_man)' }, { key: 'power', tag: 'power_(chainsaw_man)' },
    { key: 'reze', tag: 'reze_(chainsaw_man)' }, { key: 'himeno', tag: 'himeno_(chainsaw_man)' },
    { key: 'kobeni', tag: 'kobeni_higashiyama' }, { key: 'asa', tag: 'mitaka_asa' },
    // Lycoris Recoil
    { key: 'chisato', tag: 'nishikigi_chisato' }, { key: 'takina', tag: 'inoue_takina' },
    // Pokemon
    { key: 'misty', tag: 'kasumi_(pokemon)' }, { key: 'dawn', tag: 'hikari_(pokemon)' },
    { key: 'serena', tag: 'serena_(pokemon)' }, { key: 'may', tag: 'haruka_(pokemon)' },
    { key: 'cynthia', tag: 'shirona_(pokemon)' }, { key: 'nessa', tag: 'rurina_(pokemon)' },
    { key: 'marnie', tag: 'maril_(pokemon)' },
    // Vocaloid
    { key: 'miku', tag: 'hatsune_miku' }, { key: 'luka', tag: 'megurine_luka' },
    { key: 'gumi', tag: 'gumi_(vocaloid)' }, { key: 'rin vocaloid', tag: 'kagamine_rin' },
    // Honkai / Star Rail
    { key: 'kiana', tag: 'kiana_kaslana' }, { key: 'bronya', tag: 'bronya_zaychik' },
    { key: 'elysia', tag: 'elysia_(honkai)' }, { key: 'kafka', tag: 'kafka_(star_rail)' },
    { key: 'seele star', tag: 'seele_(star_rail)' },
    // Black Clover
    { key: 'noelle', tag: 'noelle_silva' }, { key: 'mimosa', tag: 'vermillion_mimosa' },
    // Goblin Slayer
    { key: 'priestess', tag: 'priestess_(goblin_slayer)' },
    // DxD
    { key: 'rias', tag: 'rias_gremory' }, { key: 'akeno', tag: 'himejima_akeno' },
    { key: 'koneko', tag: 'toujou_koneko' }, { key: 'xenovia', tag: 'quarta_xenovia' },
    // NGNL
    { key: 'shiro', tag: 'shiro_(no_game_no_life)' }, { key: 'jibril', tag: 'jibril_(no_game_no_life)' },
    // Toradora
    { key: 'taiga', tag: 'aisaka_taiga' },
    // Rent a GF
    { key: 'chizuru', tag: 'mizuhara_chizuru' }, { key: 'ruka', tag: 'sarashina_ruka' },
    // Kaguya
    { key: 'kaguya', tag: 'shinomiya_kaguya' }, { key: 'chika', tag: 'fujiwara_chika' },
    // Madoka
    { key: 'madoka', tag: 'kaname_madoka' }, { key: 'homura', tag: 'akemi_homura' },
    { key: 'mami', tag: 'tomoe_mami' },
    // Evangelion
    { key: 'rei', tag: 'ayanami_rei' }, { key: 'asuka', tag: 'souryuu_asuka_langley' },
    { key: 'mari', tag: 'illustrious_makinami' }, { key: 'misato', tag: 'katsuragi_misato' },
    // Oregairu
    { key: 'yukino', tag: 'yukinoshita_yukino' }, { key: 'yui', tag: 'yuigahama_yui' },
    { key: 'iroha', tag: 'isshiki_iroha' },
    // Sailor Moon
    { key: 'usagi', tag: 'tsukino_usagi' }, { key: 'sailor moon', tag: 'tsukino_usagi' },
    { key: 'rei sailor', tag: 'hino_rei' }, { key: 'chibiusa', tag: 'chibiusa' },
    // Love Live
    { key: 'maki', tag: 'nishikino_maki' }, { key: 'honoka', tag: 'kousaka_honoka' },
    { key: 'nico', tag: 'yazawa_nico' }, { key: 'eli', tag: 'ayase_eli' },
    // Bocchi
    { key: 'bocchi', tag: 'gotou_hitori' }, { key: 'hitori', tag: 'gotou_hitori' },
    { key: 'nijika', tag: 'ijichi_nijika' }, { key: 'ryou', tag: 'yamada_ryou' },
    { key: 'ikuyo', tag: 'kita_ikuyo' },
    // Dungeon Meshi
    { key: 'marcille', tag: 'donato_marcille' }, { key: 'falin', tag: 'touden_falin' },
    // Oshi no Ko
    { key: 'ai', tag: 'hoshino_ai' }, { key: 'ruby', tag: 'hoshino_ruby' },
    { key: 'kana', tag: 'arima_kana' },
    // Tensura
    { key: 'shion', tag: 'shion_(tensura)' }, { key: 'milim', tag: 'nava_milim' },
    { key: 'shuna', tag: 'shuna_(tensura)' },
    // Kakegurui
    { key: 'yumeko', tag: 'jabami_yumeko' }, { key: 'mary', tag: 'saotome_mary' },
    { key: 'kirari', tag: 'momobami_kirari' }, { key: 'midari', tag: 'ikishima_midari' },
    // Mushoku Tensei
    { key: 'roxy', tag: 'migurdia_roxy' },
    { key: 'sylphie', tag: 'sylphiette_(mushoku_tensei)' },
    { key: 'sylphiette', tag: 'sylphiette_(mushoku_tensei)' },
    { key: 'eris mushoku', tag: 'eris_(mushoku_tensei)' },
    // Angel Beats
    { key: 'kanade', tag: 'tachibana_kanade' }, { key: 'angel beats', tag: 'tachibana_kanade' },
    // FMA
    { key: 'winry', tag: 'rockbell_winry' }, { key: 'riza', tag: 'hawkeye_riza' },
    { key: 'olivier', tag: 'armstrong_olivier' },
    // Toaru
    { key: 'misaka', tag: 'misaka_mikoto' }, { key: 'mikoto', tag: 'misaka_mikoto' },
    { key: 'index', tag: 'index_librorum_prohibitorum' }, { key: 'shokuhou', tag: 'shokuhou_misaki' },
    // Danganronpa
    { key: 'kyoko', tag: 'kirigiri_kyouko' }, { key: 'junko', tag: 'enoshima_junko' },
    { key: 'chiaki', tag: 'nanami_chiaki' }, { key: 'sayaka', tag: 'maizono_sayaka' },
    // Extra popular
    { key: 'neco arc', tag: 'neco-arc' }, { key: 'neco-arc', tag: 'neco-arc' },
    { key: 'necoarc', tag: 'neco-arc' }, { key: 'neco arc chaos', tag: 'neco-arc_chaos' },
    { key: 'marin', tag: 'kitagawa_marin' }, { key: 'nagatoro', tag: 'nagatoro_hayase' },
    { key: 'touka', tag: 'kirishima_touka' }, { key: 'bishamon', tag: 'bishamonten_(noragami)' },
    { key: 'raphtalia', tag: 'raphtalia' }, { key: 'filo', tag: 'filo_(tate_no_yuusha)' },
    { key: 'reina', tag: 'reina_(myriad_colors)' }, { key: 'shouko', tag: 'nishimiya_shouko' },
    { key: 'lucy', tag: 'lucy_(cyberpunk_edgerunners)' },
    { key: 'power csm', tag: 'power_(chainsaw_man)' },
    { key: 'komi', tag: 'komi_shouko' },
    { key: 'yashahime', tag: 'moroha_(yashahime)' },
    { key: 'nezuko chan', tag: 'kamado_nezuko' },
    // Más personajes populares
    { key: 'power brs', tag: 'black_rock_shooter' },
    { key: 'holo', tag: 'holo_(spice_and_wolf)' },
    { key: 'spice wolf', tag: 'holo_(spice_and_wolf)' },
    { key: 'remu', tag: 'rem_(re_zero)' },
    { key: 'rezero rem', tag: 'rem_(re_zero)' },
    // Nier Automata
    { key: '2b', tag: 'yorha_no.2_type_b' }, { key: 'yorha 2b', tag: 'yorha_no.2_type_b' },
    { key: 'yorha2b', tag: 'yorha_no.2_type_b' }, { key: 'a2 nier', tag: 'yorha_a2_type_a' },
    // UTAU / Kasane Teto
    { key: 'teto', tag: 'kasane_teto' }, { key: 'kasane teto', tag: 'kasane_teto' },
    { key: 'kasane', tag: 'kasane_teto' }, { key: 'tetoo', tag: 'kasane_teto' },
    // Mushoku Tensei aliases extras
    { key: 'roxy migurdia', tag: 'migurdia_roxy' }, { key: 'roxymigurdia', tag: 'migurdia_roxy' },
    // Sword Art Online alias
    { key: 'asada shino', tag: 'asada_shino' },
    // Más populares
    { key: 'chitoge', tag: 'kirisaki_chitoge' }, { key: 'onodera', tag: 'onodera_kosaki' },
    { key: 'raku', tag: 'kirisaki_chitoge' },
    { key: 'violet evergarden', tag: 'violet_evergarden' }, { key: 'violet', tag: 'violet_evergarden' },
    { key: 'frieren', tag: 'frieren_(sousou_no_frieren)' }, { key: 'fern', tag: 'fern_(sousou_no_frieren)' },
    { key: 'ai hayasaka', tag: 'hayasaka_ai' }, { key: 'hayasaka', tag: 'hayasaka_ai' },
    { key: 'ishtar fate', tag: 'ishtar_(fate)' }, { key: 'ereshkigal', tag: 'ereshkigal_(fate)' },
    { key: 'abigail fate', tag: 'abigail_williams_(fate)' },
    { key: 'himari', tag: 'himari_(blue_archive)' }, { key: 'hoshino blue', tag: 'hoshino_(blue_archive)' },
    { key: 'shizuku', tag: 'shizuku_(blue_archive)' },
    // KonoSuba alias
    { key: 'kazuma', tag: 'satou_kazuma' },
    // Más Re:Zero
    { key: 'frederica', tag: 'baumann_frederica' }, { key: 'petra', tag: 'leyte_petra' },
    // Más MHA
    { key: 'midnight', tag: 'kayama_nemuri' }, { key: 'mt lady', tag: 'mt._lady' },
    // Más One Piece
    { key: 'vivi', tag: 'nefertari_vivi' }, { key: 'nefertari', tag: 'nefertari_vivi' },
    // ── Adiciones populares (extra) ──────────────────────────────────────
    // Genshin extra
    { key: 'mona', tag: 'mona_(genshin_impact)' }, { key: 'amber', tag: 'amber_(genshin_impact)' },
    { key: 'jean', tag: 'jean_(genshin_impact)' }, { key: 'lisa', tag: 'lisa_(genshin_impact)' },
    { key: 'rosaria', tag: 'rosaria_(genshin_impact)' }, { key: 'beidou', tag: 'beidou_(genshin_impact)' },
    { key: 'xiangling', tag: 'xiangling_(genshin_impact)' }, { key: 'kazuha', tag: 'kaedehara_kazuha' },
    { key: 'xiao', tag: 'xiao_(genshin_impact)' }, { key: 'venti', tag: 'venti_(genshin_impact)' },
    { key: 'zhongli', tag: 'zhongli_(genshin_impact)' }, { key: 'ayaka', tag: 'kamisato_ayaka' },
    { key: 'ayato', tag: 'kamisato_ayato' }, { key: 'wanderer', tag: 'wanderer_(genshin_impact)' },
    { key: 'tighnari', tag: 'tighnari_(genshin_impact)' }, { key: 'lyney', tag: 'lyney_(genshin_impact)' },
    { key: 'navia', tag: 'navia_(genshin_impact)' }, { key: 'clorinde', tag: 'clorinde_(genshin_impact)' },
    // Honkai Star Rail extra
    { key: 'march 7th', tag: 'march_7th_(star_rail)' }, { key: 'march7', tag: 'march_7th_(star_rail)' },
    { key: 'silver wolf', tag: 'silver_wolf_(star_rail)' }, { key: 'fu xuan', tag: 'fu_xuan_(star_rail)' },
    { key: 'jingliu', tag: 'jingliu_(star_rail)' }, { key: 'topaz', tag: 'topaz_(star_rail)' },
    { key: 'firefly', tag: 'firefly_(star_rail)' }, { key: 'acheron', tag: 'acheron_(star_rail)' },
    { key: 'black swan', tag: 'black_swan_(star_rail)' }, { key: 'bronya star', tag: 'bronya_(star_rail)' },
    { key: 'tingyun', tag: 'tingyun_(star_rail)' }, { key: 'sparkle', tag: 'sparkle_(star_rail)' },
    // Blue Archive
    { key: 'aru', tag: 'aru_(blue_archive)' }, { key: 'mika', tag: 'mika_(blue_archive)' },
    { key: 'arona', tag: 'arona_(blue_archive)' }, { key: 'hina', tag: 'hina_(blue_archive)' },
    { key: 'iori', tag: 'iori_(blue_archive)' }, { key: 'asuna ba', tag: 'asuna_(blue_archive)' },
    { key: 'shiroko', tag: 'shiroko_(blue_archive)' }, { key: 'yuuka', tag: 'yuuka_(blue_archive)' },
    { key: 'noa', tag: 'noa_(blue_archive)' }, { key: 'koharu', tag: 'koharu_(blue_archive)' },
    { key: 'plana', tag: 'plana_(blue_archive)' },
    // Azur Lane
    { key: 'enterprise', tag: 'enterprise_(azur_lane)' }, { key: 'belfast', tag: 'belfast_(azur_lane)' },
    { key: 'taihou', tag: 'taihou_(azur_lane)' }, { key: 'azuma', tag: 'azuma_(azur_lane)' },
    { key: 'akagi', tag: 'akagi_(azur_lane)' }, { key: 'kaga', tag: 'kaga_(azur_lane)' },
    { key: 'shimakaze', tag: 'shimakaze_(azur_lane)' },
    // Nikke
    { key: 'rapi', tag: 'rapi_(nikke)' }, { key: 'modernia', tag: 'modernia_(nikke)' },
    { key: 'scarlet', tag: 'scarlet_(nikke)' }, { key: 'helm', tag: 'helm_(nikke)' },
    { key: 'dorothy', tag: 'dorothy_(nikke)' }, { key: 'red hood', tag: 'red_hood_(nikke)' },
    // Arknights
    { key: 'amiya', tag: 'amiya_(arknights)' }, { key: 'skadi', tag: 'skadi_(arknights)' },
    { key: 'mostima', tag: 'mostima_(arknights)' }, { key: 'eyjafjalla', tag: 'eyjafjalla_(arknights)' },
    { key: 'angelina', tag: 'angelina_(arknights)' }, { key: 'texas', tag: 'texas_(arknights)' },
    { key: 'lappland', tag: 'lappland_(arknights)' }, { key: 'surtr', tag: 'surtr_(arknights)' },
    { key: 'nian', tag: 'nian_(arknights)' }, { key: 'ch\'en', tag: 'ch\'en_(arknights)' },
    // FGO/Fate extras
    { key: 'jeanne fate', tag: 'jeanne_d\'arc_(fate)' }, { key: 'mash', tag: 'mash_kyrielight' },
    { key: 'shielder', tag: 'mash_kyrielight' }, { key: 'mordred', tag: 'mordred_(fate)' },
    { key: 'jalter', tag: 'jeanne_d\'arc_alter_(fate)' }, { key: 'okita', tag: 'okita_souji_(fate)' },
    { key: 'kama', tag: 'kama_(fate)' }, { key: 'kiara', tag: 'sessyoin_kiara' },
    { key: 'parvati', tag: 'parvati_(fate)' }, { key: 'durga', tag: 'durga_(fate)' },
    // Touhou
    { key: 'reimu', tag: 'hakurei_reimu' }, { key: 'marisa', tag: 'kirisame_marisa' },
    { key: 'sakuya', tag: 'izayoi_sakuya' }, { key: 'remilia', tag: 'remilia_scarlet' },
    { key: 'flandre', tag: 'flandre_scarlet' }, { key: 'patchouli', tag: 'patchouli_knowledge' },
    { key: 'youmu', tag: 'konpaku_youmu' }, { key: 'yuyuko', tag: 'saigyouji_yuyuko' },
    // K-On
    { key: 'mio', tag: 'akiyama_mio' }, { key: 'yui kon', tag: 'hirasawa_yui' },
    { key: 'azusa', tag: 'nakano_azusa' },
    // Idolmaster / Hololive
    { key: 'haruka', tag: 'amami_haruka' }, { key: 'pekora', tag: 'usada_pekora' },
    { key: 'marine', tag: 'houshou_marine' }, { key: 'aqua hololive', tag: 'minato_aqua' },
    { key: 'gura', tag: 'gawr_gura' }, { key: 'calliope', tag: 'mori_calliope' },
    { key: 'kronii', tag: 'ouro_kronii' }, { key: 'fauna', tag: 'ceres_fauna' },
    { key: 'noel', tag: 'shirogane_noel' }, { key: 'rushia', tag: 'uruha_rushia' },
    { key: 'korone', tag: 'inugami_korone' }, { key: 'okayu', tag: 'nekomata_okayu' },
    // Chainsaw Man extras
    { key: 'quanxi', tag: 'quanxi_(chainsaw_man)' }, { key: 'fami', tag: 'fami_(chainsaw_man)' },
    // Helltaker
    { key: 'modeus', tag: 'modeus_(helltaker)' }, { key: 'azazel', tag: 'azazel_(helltaker)' },
    { key: 'cerberus', tag: 'cerberus_(helltaker)' }, { key: 'lucifer', tag: 'lucifer_(helltaker)' },
    // Jujutsu Kaisen extras
    { key: 'gojo', tag: 'gojou_satoru' }, { key: 'sukuna', tag: 'ryoumen_sukuna' },
    // Re:Zero extras
    { key: 'crusch', tag: 'crusch_karsten' }, { key: 'priscilla', tag: 'priscilla_barielle' },
    // Sword Art Online extras
    { key: 'lisbeth', tag: 'shinozaki_rika' }, { key: 'leafa', tag: 'suguha_kirigaya' },
    // Konosuba extras
    { key: 'iris', tag: 'iris_(konosuba)' },
    // Tensura extras
    { key: 'rimuru', tag: 'rimuru_tempest' },
    // Spy x Family extras
    { key: 'fiona', tag: 'fiona_frost' },
    // High School DxD extras
    { key: 'irina', tag: 'shidou_irina' }, { key: 'kuroka', tag: 'kuroka_(dxd)' },
    // Tate no Yuusha extras
    { key: 'sadina', tag: 'sadina_(tate_no_yuusha)' },
    // Eminence in Shadow
    { key: 'alpha', tag: 'alpha_(eminence_in_shadow)' }, { key: 'beta', tag: 'beta_(eminence_in_shadow)' },
    { key: 'delta', tag: 'delta_(eminence_in_shadow)' },
    // Mushoku Tensei extras
    { key: 'eris', tag: 'eris_(mushoku_tensei)' }, { key: 'rudeus', tag: 'rudeus_greyrat' },
    // MiSide
    { key: 'mita', tag: 'mita_(miside)' }, { key: 'mita miside', tag: 'mita_(miside)' },
    { key: 'miside', tag: 'mita_(miside)' }, { key: 'mita chan', tag: 'mita_(miside)' },
    { key: 'chibi mita', tag: 'chibi_mita_(miside)' },
    // Nikke: Goddess of Victory
    { key: 'rapi', tag: 'rapi_(nikke)' }, { key: 'nikke rapi', tag: 'rapi_(nikke)' },
    { key: 'modernia', tag: 'modernia_(nikke)' }, { key: 'nikke modernia', tag: 'modernia_(nikke)' },
    { key: 'scarlet nikke', tag: 'scarlet_(nikke)' }, { key: 'helm', tag: 'helm_(nikke)' },
    { key: 'dorothy nikke', tag: 'dorothy_(nikke)' }, { key: 'red hood', tag: 'red_hood_(nikke)' },
    { key: 'crown', tag: 'crown_(nikke)' }, { key: 'noise', tag: 'noise_(nikke)' },
    { key: 'maiden nikke', tag: 'maiden_(nikke)' }, { key: 'sugar nikke', tag: 'sugar_(nikke)' },
    { key: 'volume nikke', tag: 'volume_(nikke)' }, { key: 'neon', tag: 'neon_(nikke)' },
    { key: 'alice nikke', tag: 'alice_(nikke)' }, { key: 'noir', tag: 'noir_(nikke)' },
    { key: 'blanc', tag: 'blanc_(nikke)' }, { key: 'novel', tag: 'novel_(nikke)' },
    { key: 'snow white nikke', tag: 'snow_white_(nikke)' }, { key: 'biscuit', tag: 'biscuit_(nikke)' },
    // Arknights
    { key: 'amiya', tag: 'amiya_(arknights)' }, { key: 'skadi arknights', tag: 'skadi_(arknights)' },
    { key: 'mostima', tag: 'mostima_(arknights)' }, { key: 'eyjafjalla', tag: 'eyjafjalla_(arknights)' },
    { key: 'angelina', tag: 'angelina_(arknights)' }, { key: 'texas arknights', tag: 'texas_(arknights)' },
    { key: 'lappland', tag: 'lappland_(arknights)' }, { key: 'surtr', tag: 'surtr_(arknights)' },
    { key: 'ch\'en', tag: 'ch\'en_(arknights)' }, { key: 'chen arknights', tag: 'ch\'en_(arknights)' },
    { key: 'exusiai', tag: 'exusiai_(arknights)' }, { key: 'siege', tag: 'siege_(arknights)' },
    { key: 'hoshiguma', tag: 'hoshiguma_(arknights)' }, { key: 'schwarz', tag: 'schwarz_(arknights)' },
    { key: 'ceobe', tag: 'ceobe_(arknights)' }, { key: 'silverash', tag: 'silverash_(arknights)' },
    { key: 'ifrit arknights', tag: 'ifrit_(arknights)' }, { key: 'specter', tag: 'specter_(arknights)' },
    { key: 'saga', tag: 'saga_(arknights)' }, { key: 'w arknights', tag: 'w_(arknights)' },
    { key: 'blaze', tag: 'blaze_(arknights)' }, { key: 'nearl', tag: 'nearl_(arknights)' },
    { key: 'saria', tag: 'saria_(arknights)' }, { key: 'mudrock', tag: 'mudrock_(arknights)' },
    { key: 'eunectes', tag: 'eunectes_(arknights)' }, { key: 'platinum', tag: 'platinum_(arknights)' },
    // Wuthering Waves
    { key: 'jiyan', tag: 'jiyan_(wuthering_waves)' }, { key: 'calcharo', tag: 'calcharo_(wuthering_waves)' },
    { key: 'rover wuwa', tag: 'rover_(wuthering_waves)' }, { key: 'lingyang', tag: 'lingyang_(wuthering_waves)' },
    { key: 'jinhsi', tag: 'jinhsi_(wuthering_waves)' }, { key: 'changli', tag: 'changli_(wuthering_waves)' },
    { key: 'yinlin', tag: 'yinlin_(wuthering_waves)' }, { key: 'carlotta', tag: 'carlotta_(wuthering_waves)' },
    { key: 'shorekeeper', tag: 'shorekeeper_(wuthering_waves)' }, { key: 'camellya', tag: 'camellya_(wuthering_waves)' },
    { key: 'zhezhi', tag: 'zhezhi_(wuthering_waves)' }, { key: 'roccia', tag: 'roccia_(wuthering_waves)' },
    { key: 'encore wuwa', tag: 'encore_(wuthering_waves)' }, { key: 'verina', tag: 'verina_(wuthering_waves)' },
    // Zenless Zone Zero
    { key: 'nicole zzy', tag: 'nicole_demara' }, { key: 'grace howard', tag: 'grace_howard_(zzz)' },
    { key: 'koleda', tag: 'koleda_(zenless_zone_zero)' }, { key: 'nekomata', tag: 'nekomata_(zenless_zone_zero)' },
    { key: 'ellen joe', tag: 'ellen_joe_(zzz)' }, { key: 'ellen zzz', tag: 'ellen_joe_(zzz)' },
    { key: 'zhu yuan', tag: 'zhu_yuan_(zzz)' }, { key: 'qingyi', tag: 'qingyi_(zzz)' },
    { key: 'jane doe', tag: 'jane_doe_(zzz)' }, { key: 'jane zzz', tag: 'jane_doe_(zzz)' },
    { key: 'miyabi', tag: 'miyabi_(zenless_zone_zero)' }, { key: 'astra yao', tag: 'astra_yao_(zzz)' },
    { key: 'evelyn', tag: 'evelyn_chevalier_(zzz)' }, { key: 'harumasa', tag: 'harumasa_(zzz)' },
    // FGO extras
    { key: 'scathach', tag: 'scathach_(fate)' }, { key: 'tamamo', tag: 'tamamo-no-mae_(fate)' },
    { key: 'atalante', tag: 'atalante_(fate)' }, { key: 'florence', tag: 'florence_nightingale_(fate)' },
    { key: 'Morgan fate', tag: 'morgan_le_fay_(fate)' }, { key: 'melusine', tag: 'melusine_(fate)' },
    { key: 'caenis', tag: 'caenis_(fate)' }, { key: 'arash', tag: 'arash_(fate)' },
    // Demon Slayer extras
    { key: 'nezuko', tag: 'kamado_nezuko' }, { key: 'shinobu', tag: 'kocho_shinobu' },
    { key: 'mitsuri', tag: 'kanroji_mitsuri' }, { key: 'kanao', tag: 'tsuyuri_kanao' },
    { key: 'daki', tag: 'daki_(kimetsu_no_yaiba)' }, { key: 'tamayo', tag: 'tamayo_(kimetsu_no_yaiba)' },
    // Bocchi extras
    { key: 'bocchi', tag: 'gotou_hitori' }, { key: 'gotou', tag: 'gotou_hitori' },
    // Frieren extras
    { key: 'frieren', tag: 'frieren_(sousou_no_frieren)' }, { key: 'fern', tag: 'fern_(sousou_no_frieren)' },
    { key: 'sein', tag: 'sein_(sousou_no_frieren)' }, { key: 'stark', tag: 'stark_(sousou_no_frieren)' },
    // Overlord extras
    { key: 'albedo', tag: 'albedo_(overlord)' }, { key: 'shalltear', tag: 'shalltear_bloodfallen' },
    { key: 'narberal', tag: 'narberal_gamma' }, { key: 'aura', tag: 'aura_bella_fiora' },
    { key: 'evileye', tag: 'evileye_(overlord)' }, { key: 'lupusregina', tag: 'lupusregina_beta' },
    // Date a Live extras
    { key: 'shidou', tag: 'shidou_itsuka' }, { key: 'kurumi', tag: 'tokisaki_kurumi' },
    { key: 'tohka', tag: 'yatogami_touka' }, { key: 'yoshino', tag: 'yoshino_(date_a_live)' },
    { key: 'kotori', tag: 'itsuka_kotori' }, { key: 'origami', tag: 'tobiichi_origami' },
    { key: 'miku date', tag: 'izayoi_miku' }, { key: 'natsumi', tag: 'natsumi_(date_a_live)' },
    // Sword Art Online extras
    { key: 'alice sao', tag: 'alice_schuberg' }, { key: 'eugeo', tag: 'eugeo_(sao)' },
    // Naruto extras
    { key: 'hinata', tag: 'hyuuga_hinata' }, { key: 'sakura', tag: 'haruno_sakura' },
    { key: 'tsunade', tag: 'tsunade_(naruto)' }, { key: 'temari', tag: 'temari_(naruto)' },
    { key: 'ino', tag: 'yamanaka_ino' }, { key: 'mei terumi', tag: 'terumi_mei' },
    { key: 'karin', tag: 'uzumaki_karin' }, { key: 'konan', tag: 'konan_(naruto)' },
    // MHA extras
    { key: 'mirko', tag: 'usagiyama_rumi' }, { key: 'nemuri', tag: 'kayama_nemuri' },
    { key: 'nejire', tag: 'hado_nejire' }, { key: 'ibara', tag: 'shiozaki_ibara' },
    { key: 'toga', tag: 'himiko_toga' }, { key: 'camie', tag: 'utsushimi_camie' },
    // Hololive extras
    { key: 'fubuki', tag: 'shirakami_fubuki' }, { key: 'mio', tag: 'ookami_mio' },
    { key: 'subaru holo', tag: 'oozora_subaru' }, { key: 'ayame', tag: 'nakiri_ayame' },
    { key: 'miko holo', tag: 'sakura_miko' }, { key: 'nene holo', tag: 'momosuzu_nene' },
    { key: 'lamy', tag: 'yukihana_lamy' }, { key: 'botan holo', tag: 'shishiro_botan' },
    { key: 'chloe holo', tag: 'laplus_darknesss' }, { key: 'iroha', tag: 'kazama_iroha' },
    { key: 'lui', tag: 'takane_lui' }, { key: 'koyori', tag: 'hakui_koyori' },
    { key: 'ina', tag: 'ninomae_ina\'nis' }, { key: 'sana', tag: 'tsukumo_sana' },
    // Vtubers Nijisanji
    { key: 'elira', tag: 'elira_pendora' }, { key: 'pomu', tag: 'pomu_rainpuff' },
    { key: 'selen', tag: 'selen_tatsuki' }, { key: 'rosemi', tag: 'rosemi_lovelock' },
    { key: 'petra nijisanji', tag: 'petra_gurin' }, { key: 'finana', tag: 'finana_ryugu' },
    // ── JoJo's Bizarre Adventure ──────────────────────────────────────────
    { key: 'giorno', tag: 'giorno_giovanna' }, { key: 'giorno giovanna', tag: 'giorno_giovanna' },
    { key: 'dio', tag: 'dio_brando' }, { key: 'dio brando', tag: 'dio_brando' },
    { key: 'jotaro', tag: 'jotaro_kujo' }, { key: 'jotaro kujo', tag: 'jotaro_kujo' },
    { key: 'jolyne', tag: 'cujoh_jolyne' }, { key: 'jolyne cujoh', tag: 'cujoh_jolyne' },
    { key: 'trish una', tag: 'trish_una' }, { key: 'trish', tag: 'trish_una' },
    { key: 'kira', tag: 'kira_yoshikage' }, { key: 'yoshikage kira', tag: 'kira_yoshikage' },
    { key: 'gyro', tag: 'gyro_zeppeli' }, { key: 'gyro zeppeli', tag: 'gyro_zeppeli' },
    { key: 'yasuho', tag: 'hirose_yasuho' }, { key: 'hirose yasuho', tag: 'hirose_yasuho' },
    { key: 'yukako', tag: 'yamagishi_yukako' }, { key: 'lisa lisa jojo', tag: 'lisa_lisa_(jojo)' },
    // ── Death Note ────────────────────────────────────────────────────────
    { key: 'light yagami', tag: 'yagami_light' }, { key: 'light', tag: 'yagami_light' },
    { key: 'yagami', tag: 'yagami_light' }, { key: 'kira death note', tag: 'yagami_light' },
    { key: 'l death note', tag: 'l_(death_note)' }, { key: 'lawliet', tag: 'l_(death_note)' },
    { key: 'misa amane', tag: 'amane_misa' }, { key: 'misa', tag: 'amane_misa' },
    { key: 'amane misa', tag: 'amane_misa' }, { key: 'near death note', tag: 'near_(death_note)' },
    { key: 'ryuk', tag: 'ryuk_(death_note)' }, { key: 'mello', tag: 'mello_(death_note)' },
    { key: 'rem death note', tag: 'rem_(death_note)' },
    // ── Inuyasha ──────────────────────────────────────────────────────────
    { key: 'kagome', tag: 'higurashi_kagome' }, { key: 'kagome higurashi', tag: 'higurashi_kagome' },
    { key: 'inuyasha', tag: 'inuyasha_(character)' },
    { key: 'sango', tag: 'sango_(inuyasha)' }, { key: 'miroku', tag: 'miroku_(inuyasha)' },
    { key: 'sesshomaru', tag: 'sesshoumaru' }, { key: 'sesshoumaru', tag: 'sesshoumaru' },
    { key: 'kikyo', tag: 'kikyou_(inuyasha)' }, { key: 'kikyou', tag: 'kikyou_(inuyasha)' },
    { key: 'kagura inuyasha', tag: 'kagura_(inuyasha)' },
    // ── Black Butler ──────────────────────────────────────────────────────
    { key: 'sebastian', tag: 'sebastian_michaelis' }, { key: 'sebastian michaelis', tag: 'sebastian_michaelis' },
    { key: 'ciel', tag: 'phantomhive_ciel' }, { key: 'ciel phantomhive', tag: 'phantomhive_ciel' },
    { key: 'grell', tag: 'sutcliff_grell' }, { key: 'grell sutcliff', tag: 'sutcliff_grell' },
    { key: 'elizabeth midford', tag: 'midford_elizabeth' }, { key: 'lizzy midford', tag: 'midford_elizabeth' },
    { key: 'mey rin', tag: 'mei_rin_(black_butler)' }, { key: 'mey-rin', tag: 'mei_rin_(black_butler)' },
    // ── Food Wars / Shokugeki no Soma ─────────────────────────────────────
    { key: 'soma', tag: 'yukihira_souma' }, { key: 'soma yukihira', tag: 'yukihira_souma' },
    { key: 'yukihira', tag: 'yukihira_souma' }, { key: 'food wars', tag: 'nakiri_erina' },
    { key: 'erina nakiri', tag: 'nakiri_erina' }, { key: 'erina', tag: 'nakiri_erina' },
    { key: 'megumi tadokoro', tag: 'tadokoro_megumi' }, { key: 'megumi food', tag: 'tadokoro_megumi' },
    { key: 'alice nakiri', tag: 'nakiri_alice' }, { key: 'ikumi', tag: 'mito_ikumi' },
    { key: 'nikumi', tag: 'mito_ikumi' }, { key: 'mito ikumi', tag: 'mito_ikumi' },
    // ── Made in Abyss ─────────────────────────────────────────────────────
    { key: 'riko abyss', tag: 'riko_(made_in_abyss)' }, { key: 'riko made in abyss', tag: 'riko_(made_in_abyss)' },
    { key: 'nanachi', tag: 'nanachi_(made_in_abyss)' }, { key: 'prushka', tag: 'prushka_(made_in_abyss)' },
    { key: 'bondrewd', tag: 'bondrewd' }, { key: 'reg abyss', tag: 'reg_(made_in_abyss)' },
    // ── Cowboy Bebop ──────────────────────────────────────────────────────
    { key: 'spike', tag: 'spike_spiegel' }, { key: 'spike spiegel', tag: 'spike_spiegel' },
    { key: 'faye', tag: 'faye_valentine' }, { key: 'faye valentine', tag: 'faye_valentine' },
    { key: 'ed bebop', tag: 'edward_(cowboy_bebop)' }, { key: 'cowboy bebop', tag: 'faye_valentine' },
    // ── Berserk ───────────────────────────────────────────────────────────
    { key: 'guts', tag: 'guts_(berserk)' }, { key: 'guts berserk', tag: 'guts_(berserk)' },
    { key: 'griffith', tag: 'griffith_(berserk)' }, { key: 'casca', tag: 'casca_(berserk)' },
    { key: 'schierke', tag: 'schierke_(berserk)' }, { key: 'farnese', tag: 'farnese_de_vandimion' },
    // ── Spice and Wolf ────────────────────────────────────────────────────
    { key: 'holo', tag: 'holo_(spice_and_wolf)' }, { key: 'holo spice', tag: 'holo_(spice_and_wolf)' },
    { key: 'lawrence', tag: 'kraft_lawrence' }, { key: 'kraft lawrence', tag: 'kraft_lawrence' },
    // ── Trigun ────────────────────────────────────────────────────────────
    { key: 'vash', tag: 'vash_the_stampede' }, { key: 'vash trigun', tag: 'vash_the_stampede' },
    { key: 'meryl', tag: 'meryl_strife' }, { key: 'wolfwood', tag: 'wolfwood_(trigun)' },
    // ── Steins;Gate ───────────────────────────────────────────────────────
    { key: 'kurisu', tag: 'makise_kurisu' }, { key: 'makise kurisu', tag: 'makise_kurisu' },
    { key: 'christina', tag: 'makise_kurisu' }, { key: 'mayuri', tag: 'shiina_mayuri' },
    { key: 'okabe', tag: 'okabe_rintarou' }, { key: 'hououin', tag: 'okabe_rintarou' },
    { key: 'suzuha', tag: 'amane_suzuha' }, { key: 'moeka', tag: 'kiryu_moeka' },
    { key: 'steins gate', tag: 'makise_kurisu' },
    // ── Gurren Lagann ─────────────────────────────────────────────────────
    { key: 'yoko', tag: 'littner_yoko' }, { key: 'yoko littner', tag: 'littner_yoko' },
    { key: 'nia', tag: 'teppelin_nia' }, { key: 'nia teppelin', tag: 'teppelin_nia' },
    { key: 'simon gurren', tag: 'simon_(gurren_lagann)' }, { key: 'kamina', tag: 'kamina_(gurren_lagann)' },
    // ── K-On! ─────────────────────────────────────────────────────────────
    { key: 'yui hirasawa', tag: 'hirasawa_yui' }, { key: 'yui kon', tag: 'hirasawa_yui' },
    { key: 'mio akiyama', tag: 'akiyama_mio' }, { key: 'ritsu', tag: 'tainaka_ritsu' },
    { key: 'tsumugi', tag: 'kotobuki_tsumugi' }, { key: 'mugi', tag: 'kotobuki_tsumugi' },
    { key: 'azusa kon', tag: 'nakano_azusa' }, { key: 'azunyan', tag: 'nakano_azusa' },
    // ── Elfen Lied ────────────────────────────────────────────────────────
    { key: 'lucy elfen', tag: 'lucy_(elfen_lied)' }, { key: 'nyu', tag: 'lucy_(elfen_lied)' },
    { key: 'nana elfen', tag: 'nana_(elfen_lied)' }, { key: 'elfen lied', tag: 'lucy_(elfen_lied)' },
    // ── Berserk aliases ───────────────────────────────────────────────────
    { key: 'femto', tag: 'griffith_(berserk)' },
    // ── Accel World ───────────────────────────────────────────────────────
    { key: 'kuroyukihime', tag: 'kuroyukihime_(accel_world)' }, { key: 'black lotus', tag: 'kuroyukihime_(accel_world)' },
    // ── Violet Evergarden (extra aliases) ────────────────────────────────
    { key: 'gilbert', tag: 'bougainvillea_gilbert' }, { key: 'cattleya', tag: 'baudelaire_cattleya' },
    // ── SAO extra ─────────────────────────────────────────────────────────
    { key: 'quinella', tag: 'quinella_(sao)' }, { key: 'administrator sao', tag: 'quinella_(sao)' },
    { key: 'alice zuberg', tag: 'alice_zuberg' },
    // Generales
    { key: 'waifu', tag: '1girl' }, { key: 'girl', tag: '1girl' },
    { key: 'anime girl', tag: '1girl' }, { key: 'kawaii', tag: '1girl+kawaii' },
    { key: 'loli', tag: '1girl+chibi' }, { key: 'kemonomimi', tag: 'kemonomimi_mode' },
    { key: 'neko', tag: 'cat_girl' }, { key: 'nekogirl', tag: 'cat_girl' },
    { key: 'elf', tag: 'elf_(fantasy)' }, { key: 'maid', tag: 'maid' },
    { key: 'nurse', tag: 'nurse' }, { key: 'school', tag: 'school_uniform' },
    { key: 'bunny', tag: 'bunny_girl' }, { key: 'bunnygirl', tag: 'bunny_girl' },
    { key: 'fox girl', tag: 'fox_girl' }, { key: 'kitsune', tag: 'fox_girl' },
    { key: 'angel', tag: 'angel_girl' }, { key: 'demon', tag: 'demon_girl' },
    { key: 'femboy', tag: 'femboy' }, { key: 'trap', tag: 'trap' },
    { key: 'futa', tag: 'futanari' }, { key: 'tomboy', tag: 'tomboy' },
    { key: 'thicc', tag: 'thick_thighs' }, { key: 'milf', tag: 'milf' },
    { key: 'bikini', tag: 'bikini+1girl' }, { key: 'swimsuit', tag: 'swimsuit+1girl' },
    { key: 'lingerie', tag: 'lingerie+1girl' }, { key: 'gym', tag: 'gym_uniform+1girl' },
    { key: 'kimono', tag: 'kimono+1girl' }, { key: 'witch', tag: 'witch+1girl' },
    { key: 'office', tag: 'office_lady' }, { key: 'goth', tag: 'goth+1girl' },
];

// ── Distancia de Levenshtein para fuzzy matching ───────────────────────────
function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return dp[m][n];
}

function normalizar(s) {
    return s.toLowerCase().trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ');
}

function encontrarWaifu(input) {
    if (!input) return null;
    const q = normalizar(input);
    const qSinEsp = q.replace(/\s/g, '');
    const qPalabras = q.split(' ').filter(Boolean);

    // 1. Coincidencia exacta (normalizada)
    const exacta = waifuDB.find(w => normalizar(w.key) === q);
    if (exacta) return exacta;

    // 2. Sin espacios
    const sinEsp = waifuDB.find(w => normalizar(w.key).replace(/\s/g, '') === qSinEsp);
    if (sinEsp) return sinEsp;

    // 2b. Orden invertido de palabras (nombres japoneses: "amane misa" → "misa amane")
    if (qPalabras.length >= 2) {
        const qInv = [...qPalabras].reverse().join(' ');
        const invertido = waifuDB.find(w => normalizar(w.key) === qInv);
        if (invertido) return invertido;
        const invertidoSinEsp = waifuDB.find(w => normalizar(w.key).replace(/\s/g, '') === qInv.replace(/\s/g, ''));
        if (invertidoSinEsp) return invertidoSinEsp;
    }

    // 3. Partial match — menos estricto para queries largas
    const cobertura = q.length >= 8 ? 0.50 : 0.60;
    const parciales = waifuDB.filter(w => {
        const nk = normalizar(w.key);
        if (nk.includes(q)) return true;
        if (q.includes(nk) && nk.length >= Math.ceil(q.length * cobertura)) return true;
        return false;
    });
    if (parciales.length) {
        parciales.sort((a, b) => normalizar(b.key).length - normalizar(a.key).length);
        return parciales[0];
    }

    // 4. Por palabras individuales (mín 3 caracteres) — prioriza más coincidencias
    const palabras = qPalabras.filter(p => p.length >= 3);
    if (palabras.length > 0) {
        const candidatos = waifuDB
            .filter(w => {
                const norm = normalizar(w.key);
                return palabras.some(p => norm.includes(p) || p.includes(norm.replace(/\s/g, '')));
            })
            .sort((a, b) => {
                const na = normalizar(a.key), nb = normalizar(b.key);
                const matchA = palabras.filter(p => na.includes(p)).length;
                const matchB = palabras.filter(p => nb.includes(p)).length;
                if (matchA !== matchB) return matchB - matchA;
                return nb.length - na.length;
            });
        if (candidatos.length) return candidatos[0];
    }

    // 5. Fuzzy matching con Levenshtein (tolerancia según longitud)
    let mejorMatch = null;
    let mejorDist = Infinity;
    for (const w of waifuDB) {
        const norm = normalizar(w.key);
        const tolerancia = Math.max(2, Math.floor(Math.min(q.length, norm.length) * 0.35));
        const dist = levenshtein(q, norm);
        if (dist < mejorDist && dist <= tolerancia) {
            mejorDist = dist;
            mejorMatch = w;
        }
        const distSinEsp = levenshtein(qSinEsp, norm.replace(/\s/g, ''));
        if (distSinEsp < mejorDist && distSinEsp <= tolerancia) {
            mejorDist = distSinEsp;
            mejorMatch = w;
        }
    }
    if (mejorMatch) return mejorMatch;

    return null;
}

// SFW_ACCIONES extraído a src/sfw_acciones.js (reducción de ~1860 líneas)
const { SFW_ACCIONES } = require('./sfw_acciones');

module.exports = { waifuDB, encontrarWaifu };
