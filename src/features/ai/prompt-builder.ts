// Master Localization Prompt Builder
import {
    DEFAULT_MODEL,
    COMIC_UNIVERSE_PRESETS,
    COMIC_GENRE_PRESETS,
    COMIC_TONE_PRESETS,
    TARGET_LANG_MAP
} from '../../config/constants';
import { compilePronounMatrixPrompt } from '../pronoun';
import { buildLorebookPromptContext, getModelTranslationProfile } from './story-memory';
import {
    getTranslationContext,
    getStoryMemoryState,
    getAiConfig,
    TranslationContextOptions
} from './ai-state';
import { CharacterDossierEntry, LorebookEntry } from '../../types/index';

export function getTranslationGuidancePrompt(
    options?: Partial<TranslationContextOptions>,
    customDossier?: CharacterDossierEntry[],
    customLorebook?: LorebookEntry[]
): string {
    const guidanceParts: string[] = [];
    const ctx = getTranslationContext(options);
    const aiConfig = getAiConfig();
    const customContextPrompt = (ctx.translationContextPrompt || '').trim();
    const currentModelId = aiConfig.selectedModel || DEFAULT_MODEL;
    const targetLang = ctx.targetLanguage || 'vi';
    const targetLangName = TARGET_LANG_MAP[targetLang] || 'Vietnamese';
    const pronounTerm = targetLang === 'vi' ? 'pronouns (xưng hô)' : 'pronouns';

    guidanceParts.push(
        `- ROLE: You are a Master Scanlation Localizer and Manga Publication Editor. Translate meaning, subtext, tone, and character emotions—NEVER translate word-for-word or produce rigid, literal machine translations.`,
        `- PRIORITY ORDER (THỨ TỰ ƯU TIÊN):`,
        `  1. Preserve source meaning.`,
        `  2. Preserve speaker intent and emotional nuance.`,
        `  3. Preserve scene/context/character relationship.`,
        `  4. Produce natural ${targetLangName}.`,
        `  5. Maintain character voice and pronoun consistency.`,
        `  6. Keep terminology/names consistent.`,
        `  7. Keep dialogue naturally paced and bubble-friendly.`,
        `  8. Apply genre/tone/style flavor.`,
        `  9. Use slang/particles only when contextually justified.`,
        `- OVERRIDE RULES:`,
        `  * Higher-priority rules always override lower-priority stylistic preferences.`,
        `  * Compactness must NEVER remove important meaning.`,
        `  * Genre/tone must NEVER override source meaning or invent emotion.`,
        `- SOURCE FIDELITY / NO HALLUCINATION (BẢO TOÀN NGHĨA GỐC - CHỐNG TỰ DIỄN TẬP / BỊA NGHĨA):`,
        `  1. Không thêm thắt thông tin, sự kiện hoặc chi tiết không có trong câu gốc hoặc context.`,
        `  2. Không tự giải thích một câu mơ hồ. Khi bản gốc cố ý mơ hồ, giữ lại mức độ mơ hồ đó trong bản dịch ("When the source is ambiguous, preserve the ambiguity unless the surrounding context strongly resolves it.").`,
        `  3. Không tự suy ra speaker intent nếu bằng chứng không đủ.`,
        `  4. Không thêm chủ ngữ, cảm xúc, quan hệ, lý do, hành động hoặc thông tin nền nếu nguồn không hỗ trợ.`,
        `  5. Context chỉ được dùng để disambiguate khi có bằng chứng rõ ràng, không được dùng để bịa thêm nội dung.`
    );

    const srcLang = ctx.sourceLanguage || 'ja';

    if (targetLang === 'vi') {
        const fewShotExamples: string[] = [];
        if (srcLang === 'ja' || !['zh', 'ko', 'en'].includes(srcLang)) {
            fewShotExamples.push(
                `     - [JA] "私には無理だよ" ➔ Dịch dở: "Cái đó là không thể đối với tôi." | Dịch chuẩn Manga: "Quá sức tôi rồi!" / "Làm sao mà làm nổi!"`,
                `     - [JA] "嘘だろ…！？" ➔ Dịch dở: "Nó là một sự dối trá đúng không?" | Dịch chuẩn Manga: "Đùa nhau à...?" / "Không thể nào...!"`,
                `     - [JA] "そんな顔するなよ" ➔ Dịch dở: "Đừng làm khuôn mặt như vậy." | Dịch chuẩn Manga: "Làm cái mặt gì đấy?" / "Bớt bày vẻ mặt đó đi."`,
                `     - [JA] "何してるんだ？" ➔ Dịch dở: "Bạn đang làm gì vậy?" | Dịch chuẩn Manga: "Làm gì đấy?" / "Tính làm trò gì hả?"`,
                `     - [JA] "しょうがないな…" ➔ Dịch dở: "Nó không thể giúp được." | Dịch chuẩn Manga: "Đành chịu thôi..." / "Biết sao giờ..."`,
                `     - [JA] "好き" (Tỏ tình / Độc thoại nội tâm) ➔ Dịch dở: "Thích" / "Anh thích em" | Dịch chuẩn Manga: "Tớ thích cậu..." / "Mình thích cậu..."`,
                `     - [JA] "じゃあそういうことだから" (Bối rối rời đi) ➔ Dịch dở: "Vậy thì là vì chuyện đó" | Dịch chuẩn Manga: "Vậy... chuyện là thế đấy nhé!" / "Thế nên là vậy đấy..."`,
                `     - [JA] "さっきの、なんだったんだろう" (Tự hỏi một mình) ➔ Dịch dở: "Cái vừa rồi là gì vậy nhỉ?" | Dịch chuẩn Manga: "Chuyện lúc nãy... rốt cuộc là sao chứ?" / "Ý cậu ấy vừa rồi... là sao nhỉ?"`
            );
        } else if (srcLang === 'zh') {
            fewShotExamples.push(
                `     - [ZH] "你找死吗？" ➔ Dịch dở: "Ngươi đây là tìm chết sao?" | Dịch chuẩn Manhua: "Chán sống rồi à?" / "Muốn chết hả mày?"`,
                `     - [ZH] "这是怎么回事？" ➔ Dịch dở: "Chuyện này là thế nào?" | Dịch chuẩn Manhua: "Chuyện quái gì thế này?" / "Rốt cuộc là sao?"`,
                `     - [ZH] "算了，由他去吧。" ➔ Dịch dở: "Tính toán thôi, để hắn đi đi." | Dịch chuẩn Manhua: "Thôi bỏ đi, mặc kệ nó."`
            );
        } else if (srcLang === 'ko') {
            fewShotExamples.push(
                `     - [KO] "미쳤어?" ➔ Dịch dở: "Bạn có bị điên không?" | Dịch chuẩn Manhwa: "Điên à?" / "Khùng hả?"`,
                `     - [KO] "어쩌라고?" ➔ Dịch dở: "Tôi nên làm cái gì?" | Dịch chuẩn Manhwa: "Thế tính sao?" / "Thì đã làm sao?"`,
                `     - [KO] "어쩔 수 없지." ➔ Dịch dở: "Không có cách nào khác." | Dịch chuẩn Manhwa: "Đành chịu thôi." / "Biết làm sao được."`
            );
        } else if (srcLang === 'en') {
            fewShotExamples.push(
                `     - [EN] "What are you doing?" ➔ Dịch dở: "Bạn đang làm gì?" | Dịch chuẩn Manga: "Làm gì đấy?" / "Tính làm trò gì hả?"`,
                `     - [EN] "It can't be helped." ➔ Dịch dở: "Nó không thể giúp được." | Dịch chuẩn Manga: "Đành chịu thôi." / "Biết sao giờ."`,
                `     - [EN] "No way!" ➔ Dịch dở: "Không có đường!" | Dịch chuẩn Manga: "Làm gì có!" / "Không đời nào!"`
            );
        }

        guidanceParts.push(
            `- MANGA LOCALIZATION RULES (QUY TẮC BẢN DỊCH TIẾNG VIỆT CHUẨN XUẤT BẢN - CHỐNG DỊCH THÔ LỦNG CỦNG):`,
            `  1. VĂN NÓI / KHẨU NGỮ TỰ NHIÊN (SPEAKABILITY & NATURAL SPOKEN FLOW):`,
            `     - Câu thoại truyện tranh phải đọc to lên nghe êm tai, nhịp điệu dứt khoát, tự nhiên như lời ăn tiếng nói ngoài đời thực.`,
            `     - NGUYÊN TẮC: NATURAL ≠ ALWAYS SLANGY. Chỉ dùng khẩu ngữ, slang, particle (từ đệm ngữ khí) và thán từ khi chúng được hỗ trợ bởi ngữ cảnh, cảm xúc, persona và câu gốc.`,
            `     - Không tự thêm particle chỉ để làm câu nghe "Việt" hơn. Không dùng slang mạnh nếu câu gốc trung tính. Không biến mọi câu thành kiểu nói suồng sã.`,
            `  2. TRIỆT TIÊU VĂN MÁY MÓC & DỊCH THÔ (ANTI-MACHINE TRANSLATION & PRO-DROP):`,
            `     - 🚫 CẤM dịch bám trật tự từ nguyên gốc (nhất là cấu trúc câu SOV tiếng Nhật/Hàn hoặc Hán thô tiếng Trung). Hãy sắp xếp lại hoàn toàn theo trật tự tự nhiên của tiếng Việt.`,
            `     - 🚫 CẤM lạm dụng đại từ "tôi/bạn", "hắn/cô ấy" sượng sùng. TỈNH LƯỢC CHỦ NGỮ LINH HOẠT: Lược bỏ chủ ngữ khi hỏi đáp trực diện thông thường để tránh sượng sùng (VD: "Ăn chưa?", "Đi đâu đấy?"). TUY NHIÊN, trong các câu thoại tình cảm, tỏ tình, cảm ơn, xin lỗi hoặc bộc bạch cảm xúc, BẮT BUỘC GIỮ LẠI ĐẦY ĐỦ ĐẠI TỪ (VD: "Tớ thích cậu...", "Mình xin lỗi cậu nhé", "Em nhớ anh...") để giữ trọn sự chân thành, ấm áp và tình cảm của nhân vật.`,
            `     - 🚫 CẤM dùng câu bị động giả tạo ("bị/được... bởi..."). Chuyển thành câu chủ động mượt mà (VD: "Tôi bị đánh bại bởi hắn" ➔ "Tôi thua nó rồi" / "Bị nó hạ gục rồi").`,
            `     - 🚫 CẤM các từ nối sách vở rườm rà ("Bởi vì...", "Mặc dù...", "Tuy nhiên...", "Sau đó thì...", "Có lẽ là...").`,
            `  3. XƯNG HÔ LINH HOẠT THEO BỐI CẢNH & CẢM XÚC (CONTEXTUAL & EMOTIONAL PRONOUN DYNAMICS):`,
            `     - Đọc toàn bộ các câu thoại trong trang như một hoạt cảnh kịch liên tục để hiểu rõ quan hệ, tuổi tác, bối cảnh và tâm lý.`,
            `     - Duy trì một cặp xưng hô mặc định ổn định dựa trên quan hệ nhân vật và phân cảnh: bạn bè thân (mày-tao, cậu-tớ, ông-tôi), tình cảm (anh-em), gia đình (bố-con, mẹ-con), thứ bậc (sếp-em, tiền bối-em, chú-cháu).`,
            `     - Cho phép thay đổi xưng hô hoặc speech style khi phân cảnh cho thấy rõ cảm xúc, khoảng cách quan hệ, địa vị hoặc thái độ đã chuyển biến (VD: bình thường xưng "anh-em" hoặc "cậu-tớ", lúc nổi giận/xung đột có thể chuyển sang "mày-tao" nếu ngữ cảnh thực sự hỗ trợ).`,
            `     - Không tự ý đổi xưng hô chỉ vì muốn làm câu nghe mạnh hơn khi không có biến chuyển cảm xúc tương ứng.`,
            `     - 🚫 CẢNH BÁO QUAN TRỌNG VỀ GIỚI TÍNH & BỐI CẢNH MANGA:`,
            `       * BẮT BUỘC quan sát/đối chiếu diện mạo nhân vật từ hình ảnh hoặc ngữ cảnh học đường: Nếu là hai nữ sinh (cùng giới / bạn nữ / bách hợp / yuri), TUYỆT ĐỐI CẤM dùng đại từ nam-nữ "anh - em"! Phải dùng đại từ bạn bè đồng trang lứa tự nhiên như "cậu - tớ", "mình - bạn", hoặc xưng hô tiền bối "chị - em".`,
            `       * Nếu là hai nam sinh: dùng "cậu - tớ", "mày - tao", hoặc "anh - em".`,
            `       * CHỈ DÙNG "anh - em" khi có bằng chứng rõ ràng là nam - nữ yêu đương hoặc anh em trong gia đình.`,
            `       * PHÂN BIỆT BÓNG THOẠI TRỰC TIẾP VÀ SUY NGHĨ / HỒI TƯỞNG: Các bóng tròn lơ lửng, đám mây, hoặc không có đuôi nhọn chỉ vào miệng là độc thoại nội tâm hoặc hồi tưởng (như nhớ lại lời tỏ tình "好き" ➔ "Tớ thích cậu...", tự nhủ "さっきの なんだったんだろう" ➔ "Chuyện lúc nãy... rốt cuộc là sao chứ?"). Dịch thể hiện được sự ngập ngừng, thầm thì nội tâm.`,
            `  4. CHUYỂN ĐỔI TỪ CẢM THÁN & TỪ LÓNG (SLANG/IDIOMS/EXCLAMATIONS):`,
            `     - Dịch thoát ý linh hoạt từ lóng, quán ngữ và từ cảm thán sang khẩu ngữ tiếng Việt tương đương, giữ trọn năng lượng và thần thái của nhân vật khi được ngữ cảnh hỗ trợ.`,
            `  5. NHỊP ĐIỆU CÂU THOẠI TỰ NHIÊN & GIÀU CẢM XÚC (NATURAL BUBBLE CADENCE & EMOTIONAL FLOW):`,
            `     - Giữ độ dài câu thoại vừa vặn với nhịp đọc manga, TUYỆT ĐỐI KHÔNG cắt xén cụt lủn làm câu văn trở nên khô cứng, cộc cằn, vô cảm.`,
            `     - Hệ thống dàn trang của ứng dụng có tính năng co giãn phông chữ tự động (Auto-fit) và ngắt dòng thông minh, do đó HÃY DỊCH ĐẦY ĐỦ Ý NGHĨA, ĐẠI TỪ VÀ SẮC THÁI CẢM XÚC của nhân vật mà không sợ bị dài.`,
            `  6. NGUYÊN TẮC CÂU HOÀN CHỈNH & KHÔNG CHÈN XUỐNG DÒNG (SINGLE CONTINUOUS LINE MANDATE):`,
            `     - 🚫 TUYỆT ĐỐI KHÔNG chèn ký tự xuống dòng (\\n) ở giữa câu thoại trong trường "translated".`,
            `     - Mỗi câu thoại phải là một câu hoàn chỉnh, liền mạch trên 1 dòng duy nhất. Bộ máy typesetting sẽ tự động tính toán căn ngắt dòng hình thoi/elip phù hợp với bóng thoại.`,
            `  7. VÍ DỤ ĐỊNH HƯỚNG TIÊU BIỂU (CALIBRATION EXAMPLES):`,
            ...fewShotExamples
        );
    }

    if (srcLang === 'ja') {
        if (targetLang === 'vi') {
            guidanceParts.push(
                `- JAPANESE TO VIETNAMESE MANGA TRANSLATION MASTER SPECIFICATION:`,
                `  1. XƯNG HÔ ĐA DẠNG & SẮC THÁI NHÂN VẬT (PRONOUNS & PERSONA):`,
                `     - Japanese pronouns are clues about persona, NOT fixed Vietnamese mappings. Adapt flexibly based on relationship, social hierarchy, and scene dynamics:`,
                `     - 私 (Watashi) -> Trọng thị/Lịch sự: "Tôi/Em/Cháu"; Nữ thân mật: "Tớ/Em"; Bình thản: "Tôi".`,
                `     - 僕 (Boku) -> Nam dịu dàng, khiêm tốn, con trai trẻ: "Tớ - Cậu", "Anh - Em", "Em - Anh/Chị".`,
                `     - 俺 (Ore) -> Nam tính, mạnh mẽ, năng động, bốc đồng: "Tao - Mày", "Anh - Em", "Tôi".`,
                `     - あたし (Atashi) -> Nữ tính, điệu đà, nhí nhảnh: "Tớ", "Em", "Con".`,
                `     - 俺様 (Oresama) -> Kiêu ngạo, hợm hĩnh: "Bổn thiếu gia", "Ta", "Đại gia đây".`,
                `     - あなた (Anata) -> Vợ gọi chồng: "Anh"; Thân mật: "Cậu/Anh"; Lịch sự: "Anh/Chị/Ông".`,
                `     - お前 (Omae) -> Thân thiết/Ngang hàng: "Mày - Tao", "Cậu - Tớ"; Bề trên: "Chú em", "Thằng này".`,
                `     - 貴様 (Kisama) / 手前 (Teme) -> Tức giận, thù địch: "Thằng ranh", "Mày", "Tên kia", "Thằng nhãi".`,
                `     - 君 (Kimi) -> Người trên/bằng vai gọi nhẹ nhàng: "Cậu", "Em".`,
                `  2. TỪ ĐỆM & NGỮ ĐIỆU CUỐI CÂU (終助詞 - SENTENCE-ENDING PARTICLES):`,
                `     - Gợi ý sắc thái (chỉ dùng từ đệm tiếng Việt tương ứng khi cảm xúc và ngữ cảnh thực sự phù hợp):`,
                `     - ね (ne) -> "nhé", "nha", "đúng không", "nhỉ".`,
                `     - よ (yo) -> "đấy", "đó nha", "này".`,
                `     - な (na) / ぞ (zo) -> "đấy", "chưa", "đó".`,
                `     - わ (wa) -> "nha", "đấy", "mà".`,
                `     - かしら (kashira) -> "không biết nữa", "nhỉ", "sao ta".`,
                `     - じゃん (jan) -> "còn gì", "mà", "đấy thôi".`,
                `     - っけ (kke) -> "hả", "nhỉ", "quên mất".`,
                `  3. TỪ ĐỆM GIAO TIẾP & KHẨU NGỮ (AIZUCHI & CONVERSATIONAL IDIOMS):`,
                `     - なるほど (Naruhodo) -> "Ra là thế...", "Thì ra là vậy".`,
                `     - まさか (Masaka) -> "Chẳng lẽ...", "Không thể nào!", "Làm gì có!".`,
                `     - やっぱり (Yappari) -> "Quả nhiên...", "Y như rằng...", "Đúng là...".`,
                `     - やれやれ (Yare yare) -> "Haiz...", "Thiệt tình...", "Mệt mỏi thật đấy...".`,
                `     - マジで (Maji de) -> "Thật luôn?", "Thiệt hả?", "Nói nghiêm túc đấy!".`,
                `     - ヤバい (Yabai) -> "Tệ rồi!", "Đỉnh vãi!", "Chết dở!", "Vãi thật!".`,
                `     - べつに (Betsuni) -> "Đâu có gì...", "Chả có gì hết."`,
                `     - うざい (Uzai) -> "Phiền phức!", "Chướng mắt!".`,
                `     - じゃあそういうことだから / そういうことだから -> "Vậy... chuyện là thế đấy nhé!", "Thế nên là vậy đấy...", "Vậy là hiểu rồi chứ!".`,
                `     - 好き (Suki) -> Tỏ tình/Tâm sự: "Tớ thích cậu...", "Mình thích cậu...", "Anh thích em" (chỉ khi rõ nam-nữ). Khi trong bóng hồi tưởng/suy nghĩ: giữ sắc thái ngập ngừng/ngượng ngùng.`,
                `     - さっきの (Sakkino) -> "Chuyện lúc nãy...", "Chuyện vừa rồi...".`,
                `     - なんだったんだろう (Nandattan darou) -> "Rốt cuộc là sao chứ?", "Là sao vậy nhỉ?", "Ý cậu ấy là sao ta?".`,
                `  4. HẬU TỐ XƯNG HÔ (HONORIFICS): GIỮ NGUYÊN các hậu tố danh xưng Nhật Bản quen thuộc ghép phía sau tên riêng:`,
                `     - ～さん (-san), ～ちゃん (-chan), ～くん (-kun), ～様 (-sama), ～先輩 (-senpai), ～先生 (-sensei), ～殿 (-dono).`,
                `  5. TỪ TƯỢNG THANH / TỪ TƯỢNG HÌNH (SFX): Dịch sang từ cảm thán hoặc từ mô tả âm thanh/hành động tự nhiên trong tiếng Việt.`
            );
        } else {
            guidanceParts.push('- SOURCE LANGUAGE: Japanese Manga. Pay special attention to vertical writing, reading order (right-to-left), Japanese honorifics (-san, -kun, -chan, -sama), and SFX sound effects.');
        }
    } else if (srcLang === 'zh') {
        if (targetLang === 'vi') {
            guidanceParts.push(
                `- CHINESE TO VIETNAMESE MANHWA TRANSLATION MASTER SPECIFICATION:`,
                `  1. QUY TẮC XƯNG HÔ & VĂN PHONG THEO BỐI CẢNH (PRONOUNS & PERSONA):`,
                `     - HIỆN ĐẠI / ĐÔ THỊ / HỌC ĐƯỜNG: Bắt buộc chọn cặp xưng hô tiếng Việt tự nhiên phù hợp ngữ cảnh (cậu-tớ, mày-tao, anh-em, tôi-cậu, chú-cháu, sếp-em...). TUYỆT ĐỐI KHÔNG dùng đại từ "tôi - bạn" sượng sùng. Bỏ 我/你 khi ngữ cảnh đã rõ.`,
                `     - TIÊN HIỆP / KIẾM HIỆP / HUYỀN HUYỄN / CỔ ĐẠI:`,
                `       * Tự xưng tôn xưng / Bề trên: 本座 (Bổn tọa), 本王 (Bổn vương), 本帝 (Bổn đế), 本少 (Bổn thiếu gia), 老夫 (Lão phu), 朕 (Trẫm), 妾身 (Thiếp thân) -> Dịch giữ khí phách Hán Việt ("Bổn tọa", "Bổn vương", "Bổn thiếu gia", "Lão phu", "Ta").`,
                `       * Khiêm xưng / Hậu bối: 在下 (Tại hạ), 鄙人 (Bỉ nhân), 小弟 (Tiểu đệ), 晚辈 (Vãn bối) -> Dịch "Tại hạ", "Vãn bối", "Tiểu đệ", "Cháu/Em".`,
                `       * Sư môn & Tôn xưng: 师兄 (Sư huynh), 师姐 (Sư tỷ), 师弟 (Sư đệ), 师妹 (Sư muội), 师父/师傅 (Sư phụ), 尊上 (Tôn thượng), 前辈 (Tiền bối), 道友 (Đạo hữu), 阁下 (Các hạ).`,
                `       * Thù địch / Hạ thấp / Miệt thị: 小儿/小辈 (Tiểu nhi/Tiểu bối) -> "Thằng ranh", "Nhãi ranh", "Tên tiểu tử"; 狗贼/老狗 -> "Tên cẩu tặc", "Lão chó chết"; 废柴/废物 -> "Kẻ phế vật", "Đồ bỏ đi".`,
                `  2. XỬ LÝ TỪ NGHĨA HÁN VIỆT & THÀNH NGỮ (SINO-VIETNAMESE & CHENGYU 成语):`,
                `     - Thành ngữ 4 chữ Hán Việt: Nếu là cụm từ quen thuộc trong cổ phong/tiên hiệp/ngôn tình (VD: "Kinh thiên động địa", "Song hỷ lâm môn", "Khai sơn phá thạch", "Kinh hãi", "Khai thiên lập địa") -> GIỮ ÂM HÁN VIỆT mượt mà, thoát ý tự nhiên.`,
                `     - Thành ngữ / Cụm từ khẩu ngữ Hán tối nghĩa: DỊCH THOÁT Ý sang thành ngữ/tục ngữ/khẩu ngữ tiếng Việt tương đương (VD: "Giang sơn dễ đổi, bản tính khó dời", "Không đánh mà khai"), TRÁNH dịch từng từ cứng nhắc.`,
                `  3. TRỢ TỪ NGỮ KHÍ & KHẨU NGỮ TIẾNG TRUNG (MODAL PARTICLES & SPOKEN SLANG):`,
                `     - Trợ từ cuối câu (语气词): 啊 (a), 吧 (ba), 呀 (ya), 嘛 (ma), 呗 (bei), 啦 (la) -> Chuyển thành từ đệm tiếng Việt tương ứng khi phù hợp: "nhé", "nha", "đấy", "mà", "chứ", "sao", "thôi", "hả", "cơ".`,
                `     - Từ cảm thán & Khẩu ngữ: 卧槽/靠 (Wòcáo/Kào) -> "Vãi!", "Má nó!", "Độc thật!"; 没门儿 (Méiménr) -> "Mơ đi!", "Không đời nào!"; 鬼知道 (Guǐ zhīdào) -> "Quỷ mới biết!"; 算了 (Suànle) -> "Bỏ đi", "Thôi dẹp đi"; 没事 (Méishì) -> "Chẳng sao đâu", "Không có gì".`,
                `  4. THUẬT NGỮ CẢNH GIỚI, TU VI & HỆ THỐNG (CULTIVATION & SYSTEM TERMS):`,
                `     - Thống nhất thuật ngữ chuẩn Hán Việt cho cảnh giới (Luyện Khí, Trúc Cơ, Kim Đan, Nguyên Anh, Hóa Thần, Động Hư, Đại Thừa, Độ Kiếp...) và game/hệ thống (Ký chủ, Bảng thuộc tính, Rút thưởng, Điểm kinh nghiệm).`,
                `  5. TỪ TƯỢNG THANH / TỪ TƯỢNG HÌNH MANHUA (SFX - 象声词/拟声词):`,
                `     - Dịch linh hoạt sang từ cảm thán hoặc âm thanh tiếng Việt: 轰 (Hōng) -> "Đùng! / Oành!", 咔嚓 (Kāchā) -> "Rắc! / Cạch!", 嗖 (Sōu) -> "Xoẹt! / Vút!", 扑通 (Pūtōng) -> "Thịch! / Tõm!", 哈哈 (Hāhā) -> "Ha ha!", 哼 (Hēng) -> "Hừm! / Hừ!".`
            );
        } else {
            guidanceParts.push(`- SOURCE LANGUAGE: Chinese Manhua. Translate idiom phrases naturally into ${targetLangName}, keep cultivation/wuxia/fantasy terms consistent.`);
        }
    } else if (srcLang === 'ko') {
        if (targetLang === 'vi') {
            guidanceParts.push(
                `- KOREAN TO VIETNAMESE MANHWA TRANSLATION MASTER SPECIFICATION:`,
                `  1. HỆ THỐNG KÍNH NGỮ & THÂN MẬT (존댓말 vs 반말):`,
                `     - Kính ngữ (존댓말 - Jondaetmal): Dịch sang khẩu ngữ tôn kính trong tiếng Việt. Thêm từ đệm "dạ, vâng, ạ", đại từ xưng hô lịch thiệp ("Thưa sếp/ngài", "Tôi hiểu rồi ạ", "Xin chào tiền bối").`,
                `     - Nói trống / Suồng sã / Bằng vai (반말 - Banmal): Dùng các cặp xưng hô tự nhiên ("mày-tao", "cậu-tớ", "anh-em"), TRIỆT TIÊU hoàn toàn từ dạ/vâng/ạ.`,
                `  2. DANH XƯNG & HẬU TỐ MANHWA (HONORIFICS & TITLES):`,
                `     - 선배 (Sunbae) -> "Tiền bối", "Anh/Chị khóa trên", hoặc xưng "anh/chị".`,
                `     - 후배 (Hubae) -> "Hậu bối", "Đàn em", "Em".`,
                `     - 오빠 (Oppa) / 형 (Hyung) -> "Anh" (linh hoạt theo ngữ cảnh tình cảm, anh em ruột hoặc anh kết nghĩa).`,
                `     - 언니 (Unnie) / 누나 (Noona) -> "Chị".`,
                `     - 아저씨 (Ahjussi) / 아줌마 (Ahjumma) -> "Chú / Bác / Cô".`,
                `     - 님 (-nim) -> "Ngài / Sếp / Trưởng phòng / Anh / Chị".`,
                `  3. TỪ CẢM THÁN & KHẨU NGỮ WEBTOON (EXCLAMATIONS & SPOKEN SLANG):`,
                `     - 헐 (Heol) -> "Sốc thật!", "Vãi!", "Trời đất!".`,
                `     - 대박 (Daebak) -> "Đỉnh thật!", "Bá cháy!", "Quá dữ!".`,
                `     - 아이구 (Aigoo) -> "Ôi trời ơi!", "Trời ạ!", "Haiz...".`
            );
        } else {
            guidanceParts.push(`- SOURCE LANGUAGE: Korean Manhwa / Webtoon. Localize speech levels, titles, and slang naturally into ${targetLangName}.`);
        }
    } else if (srcLang === 'en') {
        if (targetLang === 'vi') {
            guidanceParts.push(
                `- ENGLISH TO VIETNAMESE COMIC TRANSLATION MASTER SPECIFICATION:`,
                `  1. PHÁ BỎ ĐẠI TỪ I/YOU TRUNG TÍNH: Tự động suy luận đại từ tiếng Việt sống động dựa trên vai vế và mối quan hệ.`,
                `  2. THÀNH NGỮ, TỪ LÓNG & CẢM THÁN COMIC: Dịch thoát ý khẩu ngữ tự nhiên.`
            );
        } else {
            guidanceParts.push(`- SOURCE LANGUAGE: English Comic/Scanlation. Infer dynamic pronouns for "I/You" based on character hierarchy.`);
        }
    }

    if (['ja', 'zh', 'ko'].includes(targetLang)) {
        guidanceParts.push(`- WRITING DIRECTION RULE: Set "vertical": true for vertical text blocks.`);
    } else {
        guidanceParts.push(`- WRITING DIRECTION RULE: The target language (${targetLangName}) is written HORIZONTALLY (left-to-right).`);
    }

    const currentUniverseKey = (ctx.comicUniverse as keyof typeof COMIC_UNIVERSE_PRESETS) || 'auto';
    const selectedGenres = ctx.comicGenres && ctx.comicGenres.length > 0
        ? ctx.comicGenres
        : ['fantasy'];
    const currentToneKey = (ctx.comicTone as keyof typeof COMIC_TONE_PRESETS) || 'classic';

    const universeSpec = COMIC_UNIVERSE_PRESETS[currentUniverseKey]?.prompt || COMIC_UNIVERSE_PRESETS.auto.prompt;
    guidanceParts.push(universeSpec);

    const genreLabels: string[] = [];
    const genrePrompts: string[] = [];
    selectedGenres.forEach((gKey) => {
        const preset = (COMIC_GENRE_PRESETS as any)[gKey];
        if (preset) {
            genreLabels.push(preset.label.replace(/^[\p{Emoji}\s]+/u, '').trim());
            genrePrompts.push(preset.prompt);
        }
    });

    if (genrePrompts.length > 0) {
        if (genrePrompts.length > 1) {
            guidanceParts.push(`- COMPOSITE GENRE PROFILE: ${genreLabels.join(' + ')}. Blend these storytelling themes harmoniously.`);
        }
        genrePrompts.forEach(p => guidanceParts.push(p));
    } else {
        guidanceParts.push(COMIC_GENRE_PRESETS.fantasy.prompt);
    }

    const toneSpec = COMIC_TONE_PRESETS[currentToneKey]?.prompt || COMIC_TONE_PRESETS.classic.prompt;
    guidanceParts.push(toneSpec);

    if (customContextPrompt) {
        guidanceParts.push(`- USER CONTEXT / TRANSLATION GUIDANCE: ${customContextPrompt}`);
    }

    const lorebookPrompt = buildLorebookPromptContext(customDossier, customLorebook);
    if (lorebookPrompt) {
        guidanceParts.push(lorebookPrompt);
    }

    const storyMem = getStoryMemoryState();
    if (storyMem.enableStoryMemory && storyMem.chapterStoryMemory.length > 0) {
        const memoryText = storyMem.chapterStoryMemory.map(m => `Trang ${m.pageIndex}: ${m.excerpt}`).join('; ');
        guidanceParts.push(`- CHAPTER STORY MEMORY (PREVIOUS PAGES CONTEXT): Here is the recent dialogue history from earlier pages in this chapter: ${memoryText}. Reuse the established character ${pronounTerm}, names, and overall tone.`);
    }

    const pronounPrompt = compilePronounMatrixPrompt();
    if (pronounPrompt) {
        guidanceParts.push(pronounPrompt);
    }

    const dialogueRule = targetLang === 'vi'
        ? '- DIALOGUE RULE: Choose Vietnamese xưng hô based on character relationship, social hierarchy, and scene dynamics. Maintain a stable default pronoun pair across the page, but allow natural shifts when emotions, distance, or tension change significantly.'
        : `- DIALOGUE RULE: Choose ${targetLangName} pronouns and forms of address from the relationship and scene, not from the surface grammar. Maintain a stable default pronoun pair, allowing natural shifts when relationship or mood changes.`;

    guidanceParts.push(
        `- TRANSLATION RULES: Keep ${targetLangName} natural and idiomatic while preserving source fidelity. Prefer natural meaning over literal wording. Preserve character voice, emotions, jokes, pacing, and subtext.`,
        dialogueRule,
        '- CONTEXT RULE: Use neighboring bubbles to infer who is speaking and emotional tone. Disambiguate without inventing unsupported content.',
        '- BUBBLE RULE: Keep manga-friendly phrasing short and punchy. Do not overexplain or drop core meaning.'
    );

    getModelTranslationProfile(currentModelId, targetLang).forEach((rule) => guidanceParts.push(rule));

    return guidanceParts.length > 0 ? `\n${guidanceParts.join('\n')}` : '';
}

